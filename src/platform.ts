import { APIEvent } from 'homebridge';
import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { CanvasAccessory } from './platformAccessory';

import axios from 'axios';
import axiosRetry from 'axios-retry';

axiosRetry(axios, { retries: 5, retryDelay: axiosRetry.exponentialDelay});

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class CanvasPlatform implements DynamicPlatformPlugin {
  public readonly Service = this.api.hap.Service;
  public readonly Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public token = '';

  public getRandom: any;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.platform);

    this.getRandom = this.memoizeTimeout(this.getRandomDirect, 60000);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Restoring accessory from cache:', accessory.displayName);

    // create the accessory handler
    // this is imported from `platformAccessory.ts`
    new CanvasAccessory(this, accessory);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * Promise to refresh auth token from a new auth request
   */
  async refreshToken(): Promise<string> {
    try {
      const options = {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      };
      const response = await axios.post('https://api.meural.com/v0/authenticate', {
        username: this.config.account_email,
        password: this.config.account_password,
      }, options);
      this.token = 'Token ' + response.data.token;
      return this.token;
    } catch (error) {
      this.log.debug(error.message, error);
      return '';
    }
  }

  /**
   * Return the cached token if it exists, otherwise fetch a new one and return that
   */
  async getToken(): Promise<string> {
    if (this.token !== '') {
      return this.token;
    } else {
      await this.refreshToken();
      return this.token;
    }
  }

  /**
   * Unregister grouped canvas if one of the children doesn't exist anyore so we can re-add fresh
   */
  unregisterRemoved(devices: any) {

    // loop over cached devices and remove any that are not active anymore
    for (const cachedAccessory of this.accessories) {
      let unreg = false;
      for (const cachedDevice of cachedAccessory.context.devices) {
        if (!devices.find((accessory: any) => accessory.id === cachedDevice.id)) {
          unreg = true;
        }
      }
      if (unreg) {
        this.log.info('Un-registering accessory:', cachedAccessory.UUID);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [cachedAccessory]);
      }
    }
  }

  /**
   * for debugging, unregister all cached devices that are loaded
   */
  unregisterAll() {
    for (const cachedAccessory of this.accessories) {
      this.log.info('Un-registering accessory:', cachedAccessory.UUID);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [cachedAccessory]);
    }
  }


  memoizeTimeout(fn: any, time: number) {

    const btoa = (b: any) => Buffer.from(b).toString('base64');

    let timeId: any;

    let cache: {
      [key: string]: any;
    } = {};

    return (...args: any[]) => {

      //Erase cache.
      timeId = setTimeout(() => {
        cache = {};
        clearInterval(timeId);
      }, time);

      //Create hash.
      const n = btoa(args);

      //Find in cache or store new values.      
      if (n in cache) { 

        return cache[n];

      } else {    
        const result = fn(n);        
        cache[n] = result;
        return result;
      }

    };

  }

  getRandomDirect(): number {
    // const now = Math.floor(Date.now() / 1000);
    // const seed = Math.ceil(now / 10) * 10;
    // var x = Math.sin(seed++) * 10000;
    // return x - Math.floor(x);
    return Math.random();
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {

    this.getToken()
      .then(async (token: string) => {
        const options = {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': token,
          },
        };
        const response = await axios.get('https://api.meural.com/v0/user/devices', options);
        const devices: any = response.data.data;

        this.unregisterRemoved(devices);

        for (const device of devices) {

          // append all device IDs together as we're grouping all meural canvases into a single devices
          // homekit only allows 1 TV per bridge. we also do this for UX reasons.
          //const ids: string = devices.map((device: any) => device.id).join(', ');
          //const keys: string = devices.map((device: any) => device.productKey).join(', ');

          const id = device.id;
          const key = device.productKey;

          // generate a unique id for the accessory this should be generated from
          // something globally unique, but constant, for example, the device serial
          // number or MAC address
          //const uuid = this.api.hap.uuid.generate(ids);
          const uuid = this.api.hap.uuid.generate(String(id));

          // check that the device has not already been registered by checking the
          // cached devices we stored in the `configureAccessory` method above
          if (!this.accessories.find(accessory => accessory.UUID === uuid)) {
            this.log.info('Registering new accessory:', key);

            // create a new accessory
            const accessory = new this.api.platformAccessory(key, uuid);

            // store a copy of all the devices objects in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.devices = [device];

            // create the accessory handler
            // this is imported from `platformAccessory.ts`
            new CanvasAccessory(this, accessory);

            // link the accessory to your platform
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

            // push into accessory cache
            this.accessories.push(accessory);

          }

        }
        
      })
      .catch((error: any) => {
        throw error;
        this.log.debug(error.message);
      });

  }
}
