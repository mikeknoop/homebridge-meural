import { CharacteristicEventTypes } from 'homebridge';
import type { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback} from 'homebridge';

import { CanvasPlatform } from './platform';

import axios from 'axios';
import axiosRetry from 'axios-retry';
import type { AxiosResponse } from 'axios';

axiosRetry(axios, { retries: 5, retryDelay: axiosRetry.exponentialDelay});

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class CanvasAccessory {
  private service: Service;
  private brightnessService: Service;

  private ips = []

  // this is an aggregated state of all canvases grouped together
  // it is okay there are state differences b/w devices here
  // because they'll get resolved whenever the user first interacts with the device
  private state = {
    Active: this.platform.Characteristic.Active.ACTIVE,
    ActiveIdentifier: 0,
    ConfiguredName: 'Meural Canvas',
    RemoteKey: 0,
    SleepDiscoveryMode: this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE,
    Brightness: 100,
    WasBrightnessZero: false,
  }

  private previousRandom: number[] = []

  private readonly headers = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  }

  constructor(
    private readonly platform: CanvasPlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    // local ip address of this device on the network
    this.ips = this.accessory.context.devices.map((device: any) => device.localIp);

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Netgear')
      .setCharacteristic(this.platform.Characteristic.Model,
        accessory.context.devices.map((device: any) => device.productKey).join(', '))
      .setCharacteristic(this.platform.Characteristic.SerialNumber,
        accessory.context.devices.map((device: any) => device.serialNumber).join(', '));

    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Television) ??
      this.accessory.addService(this.platform.Service.Television);
    this.brightnessService = this.accessory.getService(this.platform.Service.Lightbulb) ??
      this.accessory.addService(this.platform.Service.Lightbulb);

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // and the rest of the required characteristics for a television from default values
    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    this.state.ConfiguredName = this.accessory.context.devices[0].alias;
    this.service.setCharacteristic(this.platform.Characteristic.ConfiguredName, this.state.ConfiguredName);
    this.service.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on(CharacteristicEventTypes.SET, this.setConfiguredName.bind(this))
      .on(CharacteristicEventTypes.GET, this.getConfiguredName.bind(this));

    this.service.setCharacteristic(this.platform.Characteristic.Active, this.state.Active);
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .on(CharacteristicEventTypes.SET, this.setActive.bind(this))
      .on(CharacteristicEventTypes.GET, this.getActive.bind(this));

    this.service.setCharacteristic(this.platform.Characteristic.ActiveIdentifier, this.state.ActiveIdentifier);
    this.service.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .on(CharacteristicEventTypes.SET, this.setActiveIdentifier.bind(this))
      .on(CharacteristicEventTypes.GET, this.getActiveIdentifier.bind(this));

    this.service.setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode, this.state.SleepDiscoveryMode);
    this.service.getCharacteristic(this.platform.Characteristic.SleepDiscoveryMode)
      .on(CharacteristicEventTypes.GET, this.getSleepDiscoveryMode.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.RemoteKey)
      .on(CharacteristicEventTypes.SET, this.setRemoteKey.bind(this));

    // add the brightness control to the Television service (appears to do nothing in Home app)
    this.service.setCharacteristic(this.platform.Characteristic.Brightness, this.state.Brightness);
    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .on(CharacteristicEventTypes.GET, this.getBrightness.bind(this))
      .on(CharacteristicEventTypes.SET, this.setBrightness.bind(this));


    // add the brightness control to the separate lightbulb service
    this.brightnessService.setCharacteristic(this.platform.Characteristic.Name, this.state.ConfiguredName);
    this.brightnessService.setCharacteristic(this.platform.Characteristic.On, this.state.Brightness > 0);
    this.brightnessService.getCharacteristic(this.platform.Characteristic.On)
      .on(CharacteristicEventTypes.GET, this.getBrightnessOn.bind(this))
      .on(CharacteristicEventTypes.SET, this.setBrightnessOn.bind(this));

    this.brightnessService.setCharacteristic(this.platform.Characteristic.Brightness, this.state.Brightness);
    this.brightnessService.getCharacteristic(this.platform.Characteristic.Brightness)
      .on(CharacteristicEventTypes.GET, this.getBrightness.bind(this))
      .on(CharacteristicEventTypes.SET, this.setBrightness.bind(this));


    // Add a placeholder input for the current playlist
    const playlistInputService = this.accessory.getService('playlist') ??
      this.accessory.addService(this.platform.Service.InputSource, 'playlist', 'Current Playlist');
    playlistInputService
      .setCharacteristic(this.platform.Characteristic.Identifier, 0)
      .setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Current Playlist')
      .setCharacteristic(this.platform.Characteristic.Name, 'Current Playlist')
      .setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED)
      .setCharacteristic(this.platform.Characteristic.InputSourceType, this.platform.Characteristic.InputSourceType.HOME_SCREEN);
    this.service.addLinkedService(playlistInputService); // link to tv service
    
    const randomInputService = this.accessory.getService('random') ??
      this.accessory.addService(this.platform.Service.InputSource, 'random', 'Show Random');
    randomInputService
      .setCharacteristic(this.platform.Characteristic.Identifier, 1)
      .setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Show Random')
      .setCharacteristic(this.platform.Characteristic.Name, 'Show Random')
      .setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED)
      .setCharacteristic(this.platform.Characteristic.InputSourceType, this.platform.Characteristic.InputSourceType.OTHER);
    this.service.addLinkedService(randomInputService); // link to tv service

    // kick off an async update to get the real current values now that we're initialized
    this.updateAllState();

  }

  /**
   * Make a slow API call to the device to fetch latest state of screen and update our cached state
  */
  updateAllState() {

    this.updateActive();
    this.updateBrightness();

  }


  /**
   * Active
   * 
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a canvas is on.
   * 
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   * 
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  getActive(callback: CharacteristicGetCallback) {
    this.platform.log.debug('Get Characteristic Active ->', this.state.Active);
    this.updateActive(); // kicks off async request to update in the background
    // you must call the callback function
    // the first argument should be null if there were no errors
    // the second argument should be the value to return
    callback(null, this.state.Active);
  }

  /**
   * These are sent when the user changes the state of an accessory, for example, turning on a canvas
   */
  setActive(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.debug('Set Characteristic Active ->', value);
    this.state.Active = value as number;

    if (this.state.Active) {
      // turn on
      const requests: Promise<AxiosResponse<any>>[] = [];
      for (const ip of this.ips) {
        requests.push(axios.get('http://' + ip + '/remote/control_command/resume', this.headers));
      }
      Promise.all(requests)
        .then(() => {
          callback(null);
        })
        .catch((error: any) => {
          this.platform.log.debug(error.message);
          callback(error);
        });
    } else {
      // turn off
      const requests: Promise<AxiosResponse<any>>[] = [];
      for (const ip of this.ips) {
        requests.push(axios.get('http://' + ip + '/remote/control_command/suspend', this.headers));
      }
      Promise.all(requests)
        .then(() => {
          callback(null);
        })
        .catch((error: any) => {
          this.platform.log.debug(error.message);
          callback(error);
        });
    }

  }

  /**
   * Get the state from source of truth (eg. from a network request to the device)
   */
  async updateActive() {
    this.platform.log.debug('Update Characteristic Active');

    const getDeviceActive = async (ip: string) => {
      const response = await axios.get('http://' + ip + '/remote/control_check/sleep', this.headers);
      const value: any = response.data.response;
      return !value;
    };

    const states: boolean[] = [];
    for (const ip of this.ips) {
      await getDeviceActive(ip)
        .then((value: boolean) => {
          states.push(value);
        })
        .catch((error: any) => {
          this.platform.log.debug(error.message, error);
        });
    }
    this.platform.log.debug('Updating Characteristic Active -> ', states);
    // if all are off, we call it off. mixed and all on is considered on
    if (states.every((value: boolean) => {
      return !value;
    })) {
      // all off
      this.state.Active = this.platform.Characteristic.Active.INACTIVE;
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.INACTIVE);
    } else {
      // some or all on
      this.state.Active = this.platform.Characteristic.Active.ACTIVE;
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE);
    }
    this.platform.log.debug('Updated Characteristic Active -> ', this.state.Active);
  }


  /**
   * ConfiguredName
   */ 
  setConfiguredName(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.state.ConfiguredName = value as string;
    callback(null);
  }

  getConfiguredName(callback: CharacteristicGetCallback) {
    this.platform.log.debug('Get Characteristic ConfiguredName ->', this.state.ConfiguredName);
    callback(null, this.state.ConfiguredName);
  }


  /**
   * ActiveIdentifier
   */ 
  setActiveIdentifier(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.debug('Set Characteristic ActiveIdentifier ->', value);
    this.state.ActiveIdentifier = value as number;
    if (value === 1) {

      const showRandom = async (callback: CharacteristicSetCallback) => { 
        // user selected "show random" source
        // select a random index from current playlist and show that index across all devices
        // then delay an update to toggle the input back to "current playlist"
        // allows you to use this in automation in the Home app

        const getDevices = async (token: string) => {
          const options = {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': token,
            },
          };
          const response = await axios.get('https://api.meural.com/v0/user/devices', options);
          const devices: any = response.data.data;
          return devices;
        };

        const getPlaylists = async (token: string) => {
          const options = {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': token,
            },
          };
          const requests: Promise<AxiosResponse<any>>[] = [];
          for (const device of this.accessory.context.devices) {
            requests.push(axios.get('https://api.meural.com/v0/devices/' + device.id + '/galleries/?page=1&count=1000', options));
          }
          return await Promise.all(requests)
            .then((values) => {
              return values.map((response: any) => response.data.data);
            })
            .catch((error: any) => {
              this.platform.log.debug(error.message);
              callback(error);
            });
        };

        const setItems = async (items: any) => {
          const options = {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          };
          const requests: Promise<AxiosResponse<any>>[] = [];
          for (const [deviceID, itemID] of Object.entries(items)) {
            // grab the IP for the device
            const ip = this.accessory.context.devices.find((device: any) => Number(device.id) === Number(deviceID)).localIp;
            requests.push(axios.get('http://' + ip + '/remote/control_command/change_item/' + itemID, options));
          }
          return await Promise.all(requests)
            .then((values) => {
              return values.map((response: any) => response.data.data);
            })
            .catch((error: any) => {
              this.platform.log.debug(error.message);
              return;
              //callback(error); dont raise an error since we're just setting items which can be retried
            });
        };

        // returns a random index that hasn't been seen recently
        const getRandomNumberNotSeenRecently = (maxNumber: number): number => {
          const lookback = Math.min(30, maxNumber - 1);
          // limit the length of our previously seen items to the lookback window
          this.previousRandom = this.previousRandom.slice(-lookback);
          //this.platform.log.debug('previously seen random numbers', this.previousRandom);
          const randomNumber = Math.floor(this.platform.getRandom() * Math.floor(maxNumber)); // generate a chance
          if (this.previousRandom.includes(randomNumber)) {
            // try again...
            this.platform.log.debug('Selected a number, but have seen it recently, trying again...', randomNumber, this.previousRandom);
            return getRandomNumberNotSeenRecently(maxNumber);
          } else {
            this.previousRandom.push(randomNumber);
            return randomNumber;
          }
        };

        // first get a valid token since we need to make meural.com API calls
        const token = await this.platform.getToken();

        // grab the array of image IDs for each device's current playlist
        const devices: any = await getDevices(token);
        const allGalleries: any = await getPlaylists(token);

        // pick a random index within the range of the shortest playlist
        const currentGalleries: {[key: number]: number} = {};
        for (const device of devices) {
          currentGalleries[device.id] = device.currentGallery;
        }
        let galleries: any = [];
        for (const deviceGalleries of allGalleries) {
          galleries = galleries.concat(deviceGalleries);
        }
        const lengths = galleries.map((gallery: any) => gallery.itemCount);
        const shortest = Math.min(...lengths);
        const randomIndex = getRandomNumberNotSeenRecently(shortest);

        this.platform.log.debug('Setting Characteristic ActiveIdentifier -> [random index, shortest]', [randomIndex, shortest]);

        // grab the item ID at that index for all devices
        const pickedItems: {[key: number]: number} = {};
        for (const [deviceID, currentGallery] of Object.entries(currentGalleries)) {
          const gallery = galleries.find((gallery: any) => gallery.id === currentGallery);
          if (gallery) {
            pickedItems[Number(deviceID)] = gallery.itemIds[randomIndex];
          }
        }

        this.platform.log.debug('Setting Characteristic ActiveIdentifier -> {picked items}', pickedItems);

        // set all devices on the local network to the image ID we selected at index
        await setItems(pickedItems);

        setTimeout(() => {
          // set the state back to the default input to make the "show random" item act like a toggle
          this.platform.log.debug('Setting Characteristic ActiveIdentifier, back to default ->', 0);
          this.state.ActiveIdentifier = 0;
          this.service.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, 0);
        }, 250);

        callback(null);

      };

      showRandom(callback);

    }
  }

  getActiveIdentifier(callback: CharacteristicGetCallback) {
    this.platform.log.debug('Get Characteristic ActiveIdentifier ->', this.state.Active);
    callback(null, this.state.ActiveIdentifier);
  }


  /**
   * SleepDiscoveryMode
   */ 
  getSleepDiscoveryMode(callback: CharacteristicGetCallback) {
    this.platform.log.debug('Get Characteristic SleepDiscoveryMode ->', this.state.SleepDiscoveryMode);
    callback(null, this.state.SleepDiscoveryMode);
  }


  /**
   * RemoteKey
   */ 
  setRemoteKey(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.debug('Set Characteristic RemoteKey ->', value);
    this.state.RemoteKey = value as number;

    // from https://developers.homebridge.io/#/characteristic/RemoteKey
    const KEY_MAP = [
      [this.platform.Characteristic.RemoteKey.ARROW_UP, '/remote/control_command/set_key/up'],
      [this.platform.Characteristic.RemoteKey.ARROW_DOWN, '/remote/control_command/set_key/down'],
      [this.platform.Characteristic.RemoteKey.ARROW_LEFT, '/remote/control_command/set_key/left'],
      [this.platform.Characteristic.RemoteKey.ARROW_RIGHT, '/remote/control_command/set_key/right'],
      [this.platform.Characteristic.RemoteKey.BACK, '/remote/control_command/set_key/left'],
      [this.platform.Characteristic.RemoteKey.INFORMATION, '/remote/control_command/set_key/up'],
      [this.platform.Characteristic.RemoteKey.PLAY_PAUSE, '/remote/control_command/set_key/right'],
    ];

    const SUPPORTED_KEYS: number[] = KEY_MAP.map((key: any) => {
      return key[0];
    }); 
    if (SUPPORTED_KEYS.includes(value as number)) {

      const key: any = KEY_MAP.find(key => key[0] === value);
      const route = key[1];

      const requests: Promise<AxiosResponse<any>>[] = [];
      for (const ip of this.ips) {
        requests.push(axios.get('http://' + ip + route, this.headers));
      }
      Promise.all(requests)
        .then(() => {
          callback(null);
        })
        .catch((error: any) => {
          this.platform.log.debug(route, error.message);
          callback(error);
        });

    }

  }


  /**
   * Brightness
   */
  getBrightness(callback: CharacteristicGetCallback) {
    this.platform.log.debug('Get Characteristic Brightness ->', this.state.Brightness);
    this.updateBrightness(); // kicks off async request to update in the background
    // you must call the callback function
    // the first argument should be null if there were no errors
    // the second argument should be the value to return
    callback(null, this.state.Brightness);
  }

  /**
   * Brightness
   */
  setBrightness(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.debug('Set Characteristic Brightness ->', value);
    this.state.Brightness = value as number;

    if (this.state.Brightness === 0) {
      this.state.WasBrightnessZero = true;
    } else {
      this.state.WasBrightnessZero = false;
    }

    const requests: Promise<AxiosResponse<any>>[] = [];
    for (const ip of this.ips) {
      requests.push(axios.get('http://' + ip + '/remote/control_command/set_backlight/' + value, this.headers));
    }
    Promise.all(requests)
      .then(() => {
        callback(null);
      })
      .catch((error: any) => {
        this.platform.log.debug(error.message);
        callback(error);
      });

  }

  /**
   * Brightness
   */
  async updateBrightness() {
    this.platform.log.debug('Update Characteristic Brightness');

    const getDeviceBrightness = async (ip: string) => {
      const response = await axios.get('http://' + ip + '/remote/get_backlight', this.headers);
      const value: any = response.data.response;
      return value;
    };

    const states: number[] = [];
    for (const ip of this.ips) {
      await getDeviceBrightness(ip)
        .then((value: number) => {
          states.push(value);
        })
        .catch((error: any) => {
          this.platform.log.debug(error.message);
        });
    }

    // take the max brightness across all screens, call that the brightness
    const max: number = Math.max(...states);

    this.state.Brightness = max;
    this.service.updateCharacteristic(this.platform.Characteristic.Brightness, max);
    this.brightnessService.updateCharacteristic(this.platform.Characteristic.Brightness, max);

    if (this.state.Brightness === 0) {
      this.state.WasBrightnessZero = true;
    } else {
      this.state.WasBrightnessZero = false;
    }

    this.platform.log.debug('Updated Characteristic Brightness -> ', max);
  }


  /**
   * Brightness Service On
   */
  getBrightnessOn(callback: CharacteristicGetCallback) {
    this.platform.log.debug('Get Characteristic Brightness On ->', this.state.Brightness > 0);
    this.getBrightness((error, value) => {
      callback(error, value as number > 0);
    });
  }

  /**
   * Brightness Service On
   */
  setBrightnessOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.debug('Set Characteristic Brightness On ->', value, this.state.WasBrightnessZero);

    // this logic deals with odd homekit behavior that sends "on: true"
    // after every brightness control -- even when turning the brightness to zero.
    // we also have to deal with behavior when tapping panel in home that
    // turns brightness "off" and tapping it to re-enable. this logic handles all of the above
    if (this.state.WasBrightnessZero && value) {
      this.service.updateCharacteristic(this.platform.Characteristic.Brightness, 100);
      this.brightnessService.updateCharacteristic(this.platform.Characteristic.Brightness, 100);
      this.setBrightness(100, callback);
    } else {
      if (!value) {
        this.setBrightness(0, callback);
      } else {
        callback(null); // do nothing
      }
    }

  }

}
