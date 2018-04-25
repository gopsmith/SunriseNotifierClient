import {
    Dimensions,
  } from 'react-native';

const BKGD_IMAGE_FILE_320x568 = require('./img/SunTimes-Gradient-640x1136.png');  //iPhone 5S, SE
const BKGD_IMAGE_FILE_568x320 = require('./img/SunTimes-Gradient-1136x640.png');  //iPhone 5S, SE (landscape)
const BKGD_IMAGE_FILE_375x667 = require('./img/SunTimes-Gradient-750x1334.png');  //iPhone 6,6S,6+,6S+,7,8
const BKGD_IMAGE_FILE_667x375 = require('./img/SunTimes-Gradient-1334x750.png');  //iPhone 6,6S,6+,6S+,7,8 (landscape)
const BKGD_IMAGE_FILE_414x736 = require('./img/SunTimes-Gradient-1080x1920.png'); //iPhone 7+,8+
const BKGD_IMAGE_FILE_736x414 = require('./img/SunTimes-Gradient-1920x1080.png'); //iPhone 7+,8+ (landscape)
const BKGD_IMAGE_FILE_375x812 = require('./img/SunTimes-Gradient-1125x2436.png');  //iPhone X
const BKGD_IMAGE_FILE_812x375 = require('./img/SunTimes-Gradient-2436x1125.png');  //iPhone X (landscape)

//Set the background image and size "constants". This has to be done first right here at the top, in this IIFE.
//Otherwise, it's too late - if set in App constructor or componentDidMount, the "constants" 
//will have been already supplied to the render() method.
export function getBackgroundImageFile() {
  //this is not strictly a constant, but is treated that way, set only once
  let BKGD_IMAGE_FILE;

  const {width, height} = Dimensions.get('window');
  console.log (`***ORIENTATION: ${width > height ? "landscape" : "portrait"}, ${width} x ${height}`);
  
  switch (`${width},${height}`) {
    case '320,568':  //UIKit 320x568 = iPhone 5S,SE - DeviceInfo.getDeviceId() = "iPhone6,1", "iPhone8,4"
      BKGD_IMAGE_FILE = BKGD_IMAGE_FILE_320x568;
      console.log(`***BKGD: 640x1136 (iPhone 5S,SE), WIDTH: ${width}, HEIGHT: ${height}`);
      break;
    case '568,320':  //UIKit 320x568 = iPhone 5S,SE (landscape)
      BKGD_IMAGE_FILE = BKGD_IMAGE_FILE_568x320;
      console.log(`***BKGD: 1136x640 (iPhone 5S/SE), WIDTH: ${width}, HEIGHT: ${height}`);
      break;

    case '414,736':  //UIKit 414x736 = iPhone 6+,6s+,7+,8+ - DeviceInfo.getDeviceId() = "iPhone7,1", "iPhone8,2", "iPhone9,2", "iPhone10,5"
      BKGD_IMAGE_FILE = BKGD_IMAGE_FILE_414x736;
      console.log(`***BKGD: 1080x1920 (iPhone 6+/6s+/7+/8+), WIDTH: ${width}, HEIGHT: ${height}`);
      break;
    case '736,414':  //UIKit 414x736 = iPhone 6+,6s+,7+,8+ (landscape)
      BKGD_IMAGE_FILE = BKGD_IMAGE_FILE_736x414;
      console.log(`***BKGD: 1920x1080 (iPhone 6+/6s+/7+/8+), WIDTH: ${width}, HEIGHT: ${height}`);
      break;

    case '375,812':  //UIKit 375x812 = iPhone X - DeviceInfo.getDeviceId() = "Phone10,3"
      BKGD_IMAGE_FILE = BKGD_IMAGE_FILE_375x812;
      console.log(`***BKGD: 1125x2436 (iPhone X), WIDTH: ${width}, HEIGHT: ${height}`);
      break;
    case '812,375':  //UIKit 375x812 = iPhone X (landscape)
      BKGD_IMAGE_FILE = BKGD_IMAGE_FILE_812x375;
      console.log(`***BKGD: 2436x1125 (iPhone X), WIDTH: ${width}, HEIGHT: ${height}`);
      break;

    case '667,375':  //UIKit 375x667 = Phone 6,6s,7,8 (landscape)
      BKGD_IMAGE_FILE = BKGD_IMAGE_FILE_667x375;
      console.log(`***BKGD: 1334x750 (iPhone 6/6s/7/8), WIDTH: ${width}, HEIGHT: ${height}`);
      break;
    case '375,667':  //UIKit 375x667 = Phone 6,6s,7,8 - DeviceInfo.getDeviceId() = iPhone7,2", "iPhone8,1", "iPhone9,1", "iPhone10,4"
    default:
      BKGD_IMAGE_FILE = BKGD_IMAGE_FILE_375x667;
      console.log(`***BKGD: 750x1334 (*DEFAULT*, iPhone 6/6s/7/8), WIDTH: ${width}, HEIGHT: ${height}`);
      break;
    };

    return BKGD_IMAGE_FILE;
}

