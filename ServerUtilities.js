export function urlForSunTimesQuery (latitude, longitude, day) {
  const data = {
    lat: latitude,
    lng: longitude,
    date: day,  //'today' or 'tomorrow', or something like '2018-01-31'
    formatted: '0',
  };
  return 'https://api.sunrise-sunset.org/json?' + querystringedData(data);
};

export function urlForGoogleGeocodeQuery (latitude, longitude, apiKey) {
  const data = {
    latlng: `${latitude},${longitude}`,
    key: apiKey,
  };
  return 'https://maps.googleapis.com/maps/api/geocode/json?' + querystringedData(data);
}

export function urlAndDataForSunriseServer (latitude, longitude, uniqueID, deviceToken, apiPassword) {
  const data = {
    api_password: apiPassword,
    device_uuid: uniqueID,
    device_id: deviceToken,
    device_lat: latitude,
    device_lng: longitude,
  };
  return ['https://sunrise-amigo.herokuapp.com/device/', querystringedData(data)];
};

function querystringedData (data) {
  return Object.keys(data)
    .map(key => `${key}=${encodeURIComponent(data[key])}`)
    .join('&');
};

export function fetchWithTimeout(url, fetchTimeout, initializer) {
    let didTimeOut = false;
  
    return new Promise(function(resolve, reject) {
        const timeout = setTimeout(() => {
            didTimeOut = true;
            reject(new Error(`***fetch TIMED OUT: ${url}`));
        }, fetchTimeout);
  
        fetch(url, initializer)
          .then(
            (response) => {
              clearTimeout(timeout);
              if(!didTimeOut) {
                responseStr = JSON.stringify(response).slice(0, 2000);
                console.log(`***fetch good!\n\n\t\t${responseStr}\n`);
                resolve(response);
              }
            },
            (error) => {
              clearTimeout(timeout);
              console.log('*** fetch FAILED! ', error); //string interp. N/G for err OBJECT
              if(didTimeOut) return; // Rejection already happened with setTimeout
              reject(error);
            }
          )
          .catch((err) => {
            clearTimeout(timeout);
            console.log('*** fetch FAILED! ', err); //string interp. N/G for err OBJECT
            if(didTimeOut) return; // Rejection already happened with setTimeout
            reject(err);  // Reject with error
          });
    });
}
  
export function unpackSunTimes(response) {
  const sunrise = new Date(response.results.sunrise);
  const sunriseLocaleDateStr = sunrise.toLocaleDateString();
  const sunriseLocaleTimeStr = sunrise.toLocaleTimeString();
  const sunriseStr = sunrise.toDateString().slice(0,4)
      + sunriseLocaleDateStr.slice(0, sunriseLocaleDateStr.lastIndexOf('/') + 1) + sunriseLocaleDateStr.slice(-2) + ', '
      + sunriseLocaleTimeStr.slice(0, sunriseLocaleTimeStr.lastIndexOf(':')) + sunriseLocaleTimeStr.slice(-3)

  const sunset = new Date(response.results.sunset);
  const sunsetLocaleDateStr = sunset.toLocaleDateString();
  const sunsetLocaleTimeStr = sunset.toLocaleTimeString();
  const sunsetStr = sunset.toDateString().slice(0,4)
      + sunsetLocaleDateStr.slice(0, sunsetLocaleDateStr.lastIndexOf('/') + 1) + sunsetLocaleDateStr.slice(-2) + ', '
      + sunsetLocaleTimeStr.slice(0, sunsetLocaleTimeStr.lastIndexOf(':')) + sunsetLocaleTimeStr.slice(-3)

  return {sunrise: sunrise, sunriseStr: sunriseStr, sunset: sunset, sunsetStr: sunsetStr};
};

export function getCurrentTimeSlot (sunTimes, syncedNow) {
  const now = syncedNow || new Date();
  console.log(`***getCurrentTimeSlot: returning ${now > sunTimes.sunset ? 2 : now > sunTimes.sunrise ? 1 : 0}; now = ${now}, sunTimes.sunrise = ${sunTimes.sunrise}, sunTimes.sunset = ${sunTimes.sunset}`);

  //returns: 0 = morning, before sunrise; 1 = daytime (after sunrise); 2 = evening (after sunset)
  return now > sunTimes.sunset ? 2 : now > sunTimes.sunrise ? 1 : 0;
};

export function shouldUpdateSunTimes (sunriseString, sunsetString, previousTimeSlot) {
  const now = new Date();
  const sunrise = new Date(sunriseString);
  const sunset = new Date(sunsetString);

  currentTimeSlot = getCurrentTimeSlot({sunrise: sunrise, sunset: sunset}, now);
  console.log(`***shouldUpdateSunTimes: currentTimeSlot = ${currentTimeSlot}, previousTimeSlot = ${previousTimeSlot}; returning ${!sunrise || !sunset || currentTimeSlot != previousTimeSlot || ((now > sunrise || now > sunset) && currentTimeSlot != previousTimeSlot)}`);

  return !sunrise || !sunset || currentTimeSlot != previousTimeSlot || (
    (now > sunrise || now > sunset) && currentTimeSlot != previousTimeSlot
  );
};

