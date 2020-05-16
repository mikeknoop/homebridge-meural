
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

<img src="https://avatars3.githubusercontent.com/u/17621476" width="150">

</p>


# Meural Canvas

Control Meural canvases via HomeKit. Supports single or multiple canvases (multiple canvases are grouped together as a single device and actions synced between them). The canvas is exposes to HomeKit as a "Television" accessory which shows up in the Home app as well as Control Center remote widget.

* Previous Photo ("swipe left")
* Next Photo ("swipe right")
* See info ("swipe up")
* Navigate menus (via the 4-way control pad)
* Show Random (pick a random index from current device playlist; shows the same index across all devices if you have multiple canvases allowing you to create photo groups)
* Control brightness, on/off
* Automate on/off, brightness, and show random

Known to work with Meural Canvas I. Should work with Cavnas II as well, but not confirmed.

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
          "account_password": ""
        }
        ...
    ]
    ...
}
```


2. `npm install homebridge-meural`

## Version history

`0.9.0`:

* Initial release
* Adds support for Canvas (single or many) added as a single Television accessory

## License

MIT