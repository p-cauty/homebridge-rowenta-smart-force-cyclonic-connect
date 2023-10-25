import {Service, PlatformAccessory, CharacteristicValue} from 'homebridge';

import { SmartForceCyclonicConnectHomebridgePlatform } from './platform';
import {insecureAxios} from './insecure_axios';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class SmartForceCyclonicConnectPlatformAccessory {
  private readonly CLEANING_PARAMETER_ECO = 2;
  private readonly CLEANING_PARAMETER_STANDARD = 1;
  private readonly CLEANING_PARAMETER_BOOST = 3;

  private readonly ROTATION_SPEED_STOPPED = 0;
  private readonly ROTATION_SPEED_ECO = 33;
  private readonly ROTATION_SPEED_STANDARD = 66;
  private readonly ROTATION_SPEED_BOOST = 100;

  private readonly ROTATION_SPEEDS = [
    this.ROTATION_SPEED_STOPPED,
    this.ROTATION_SPEED_STANDARD,
    this.ROTATION_SPEED_ECO,
    this.ROTATION_SPEED_BOOST
  ];

  private readonly MODE_READY = 'ready';
  private readonly MODE_CLEANING = 'cleaning';
  private readonly MODE_GO_GOME = 'go_home';

  private readonly CHARGING_UNCONNECTED = 'unconnected';
  private readonly CHARGING_CONNECTED = 'connected';
  private readonly CHARGING_CHARGING = 'charging';

  private fanService: Service;
  private batteryService: Service;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private vacuumCleanerState = {
    Active: this.platform.Characteristic.Active.INACTIVE,
    RotationSpeed: this.ROTATION_SPEED_STANDARD,
    StatusLowBattery: this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
    BatteryLevel: 100,
    ChargingState: this.platform.Characteristic.ChargingState.NOT_CHARGING,
  };

  constructor(
    private readonly platform: SmartForceCyclonicConnectHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Rowenta')
      .setCharacteristic(this.platform.Characteristic.Model, 'Smart Force Cyclonic Connect')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.fanService = this.accessory.getService(this.platform.Service.Fanv2) || this.accessory.addService(this.platform.Service.Fanv2);
    this.fanService.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    this.fanService.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .onGet(this.getRotationSpeed.bind(this))
      .onSet(this.setRotationSpeed.bind(this));

    this.batteryService = this.accessory.getService(this.platform.Service.Battery) || this.accessory.addService(this.platform.Service.Battery);
    this.batteryService.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .onGet(this.getStatusLowBattery.bind(this));

    this.batteryService.getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .onGet(this.getBatteryLevel.bind(this));

    this.batteryService.getCharacteristic(this.platform.Characteristic.ChargingState)
      .onGet(this.getChargingState.bind(this));

    /**
     * Updating characteristics values asynchronously.
     */
    setInterval(() => {
      this.updateStatus().then();
    }, 30000);
  }

  async updateStatus() {
    const CHARGING_STATES = {};
    CHARGING_STATES[this.CHARGING_UNCONNECTED] = this.platform.Characteristic.ChargingState.NOT_CHARGEABLE;
    CHARGING_STATES[this.CHARGING_CONNECTED] = this.platform.Characteristic.ChargingState.NOT_CHARGING;
    CHARGING_STATES[this.CHARGING_CHARGING] = this.platform.Characteristic.ChargingState.CHARGING;

    insecureAxios.get('https://' + this.accessory.context.device.address + '/status')
        .then(response => {
          this.vacuumCleanerState = {
            Active: response.data.mode === this.MODE_CLEANING ?
                this.platform.Characteristic.Active.ACTIVE :
                this.platform.Characteristic.Active.INACTIVE,
            RotationSpeed: this.ROTATION_SPEEDS[response.data.cleaning_parameter_set],
            StatusLowBattery: response.data.battery_level < 20 ?
                this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW :
                this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
            BatteryLevel: response.data.battery_level,
            ChargingState: CHARGING_STATES[response.data.charging],
          };
        });

    // push the new values to HomeKit
    this.fanService.updateCharacteristic(this.platform.Characteristic.Active, this.vacuumCleanerState.Active);
    this.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.vacuumCleanerState.RotationSpeed);
    this.batteryService.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.vacuumCleanerState.StatusLowBattery);
    this.batteryService.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.vacuumCleanerState.BatteryLevel);
    this.batteryService.updateCharacteristic(this.platform.Characteristic.ChargingState, this.vacuumCleanerState.ChargingState);

    this.platform.log.debug('Updated Active value: ', this.vacuumCleanerState.Active);
    this.platform.log.debug('Updated RotationSpeed value: ', this.vacuumCleanerState.RotationSpeed);
    this.platform.log.debug('Updated StatusLowBattery value: ', this.vacuumCleanerState.StatusLowBattery);
    this.platform.log.debug('Updated BatteryLevel value: ', this.vacuumCleanerState.BatteryLevel);
    this.platform.log.debug('Updated ChargingState value: ', this.vacuumCleanerState.ChargingState);
  }

  async startCleaning(cleaning_parameter: number) {
    insecureAxios.get('https://' + this.accessory.context.device.address +
      '/clean_start_or_continue?cleaning_parameter_set=' + cleaning_parameter)
      .then(response => {
        this.vacuumCleanerState.Active = this.platform.Characteristic.Active.ACTIVE;
        this.vacuumCleanerState.RotationSpeed = this.ROTATION_SPEEDS[cleaning_parameter];

        this.fanService.updateCharacteristic(this.platform.Characteristic.Active, this.vacuumCleanerState.Active);
        this.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.vacuumCleanerState.RotationSpeed);

        this.platform.log.debug('Updated Active value: ', this.vacuumCleanerState.Active);
        this.platform.log.debug('Updated RotationSpeed value: ', this.vacuumCleanerState.RotationSpeed);

        this.updateStatus().then();
      });
  }

  async goHome() {
    insecureAxios.get('https://' + this.accessory.context.device.address + '/go_home')
      .then(response => {
        this.vacuumCleanerState.Active = this.platform.Characteristic.Active.INACTIVE;
        this.vacuumCleanerState.RotationSpeed = this.ROTATION_SPEED_STOPPED;

        this.fanService.updateCharacteristic(this.platform.Characteristic.Active, this.vacuumCleanerState.Active);
        this.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.vacuumCleanerState.RotationSpeed);

        this.platform.log.debug('Updated Active value: ', this.vacuumCleanerState.Active);
        this.platform.log.debug('Updated RotationSpeed value: ', this.vacuumCleanerState.RotationSpeed);

        this.updateStatus().then();
      });
  }

  async getActive(): Promise<CharacteristicValue> {
    return this.vacuumCleanerState.Active;
  }

  async setActive(value: CharacteristicValue) {
    switch (value) {
      case this.platform.Characteristic.Active.ACTIVE:
        await this.startCleaning(this.CLEANING_PARAMETER_STANDARD);
        break;

      case this.platform.Characteristic.Active.INACTIVE:
        await this.goHome();
        break;
    }
  }

  async getRotationSpeed(): Promise<CharacteristicValue> {
    return this.vacuumCleanerState.RotationSpeed;
  }

  async setRotationSpeed(value: CharacteristicValue) {
    if (value === this.ROTATION_SPEED_STOPPED) {
      await this.goHome();
    } else if (value > this.ROTATION_SPEED_STOPPED && value < 50) {
      await this.startCleaning(this.CLEANING_PARAMETER_ECO);
    } else if (value >= 50 && value < 75) {
      await this.startCleaning(this.CLEANING_PARAMETER_STANDARD);
    } else if (value >= 75) {
      await this.startCleaning(this.CLEANING_PARAMETER_BOOST);
    }
  }

  async getStatusLowBattery(): Promise<CharacteristicValue> {
    return this.vacuumCleanerState.StatusLowBattery;
  }

  async getBatteryLevel(): Promise<CharacteristicValue> {
    return this.vacuumCleanerState.BatteryLevel;
  }

  async getChargingState(): Promise<CharacteristicValue> {
    return this.vacuumCleanerState.ChargingState;
  }
}
