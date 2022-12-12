
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

<img src="https://avatars3.githubusercontent.com/u/17621476" width="150">

</p>


# Meural Canvas

Control Meural canvases via HomeKit. Supports single or multiple canvases.

* Previous Photo ("swipe left") [via control center]
* Next Photo ("swipe right") [via control center]
* See info ("swipe up") [via control center]
* Navigate menus [via control center]
* Show Random (pick a random index from current device playlist; shows the same index across all devices if you have multiple canvases allowing you to create photo groups) [via Home app]
* Control brightness, on/off [via Home app]
* Automate on/off, brightness, and show random [via Home app]

Works with Canvas I, Canvas II, and Frame.

## Installation

1. Add and fill out the following in your `config.json` in the `platforms` section:

```
{
    ...
    "platforms": [
        ...
        {
          "platform": "MeuralCanvas",
          "account_email": "", // for online https://my.meural.netgear.com/ account
          "account_password": "",
          "exclude_devices": ["5TS19578A01D8", ...] // optional, excludes a device in your account from appearing in HomeKit
        }
        ...
    ]
    ...
}
```


2. `npm install homebridge-meural`

## Version history

`0.9.8`:

* Fix slow handling of ActiveIdentifier callback bug

`0.9.7`:

* Publish Meurals as separate accessories so each has a dedicate remote in control center

`0.9.5`:

* Adds a new config option `exclude_devices` which takes an array of Meural serial numbers and excludes them from showing up in HomeKit

`0.9.4`:

* Increase the sync time for "show random" to 60s from 10s

`0.9.3`:

* Ungroups mulitple canvases to show them as separate devices now
* You can still sync "show random" across mulitple devices by putting all the devices in a single Home Scene

`0.9.0`:

* Initial release
* Adds support for Canvas (single or many) added as a single Television accessory

## Development

1. Install Homebridge
2. `npm link` (first time only, to link npm repo for your local dev environment)
3. `npm install`
4. `npm run watch`

This repo is written in TypeScript.

## License

MIT
