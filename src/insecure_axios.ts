import axios from 'axios';
import * as https from 'https';

export const insecureAxios = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
  }),
});