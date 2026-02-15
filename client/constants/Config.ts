const DEV_SERVER = 'http://localhost:3000';
const PROD_SERVER = 'https://piqabu.onrender.com';

export const CONFIG = {
    SIGNAL_TOWER_URL: __DEV__ ? DEV_SERVER : PROD_SERVER,
};
