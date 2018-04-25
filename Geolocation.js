export function getLocation (cb, cbError, options) {
  let highAccuracySuccess = false
  let highAccuracyError = false
  let highAccuracy = !options || options.highAccuracy === undefined ? true : options.highAccuracy
  console.log('***options = ', options, '***highAccuracy = ', highAccuracy);
  let timeout = !options || options.timeout === undefined ? 10000 : options.timeout
  //timeout = 1;  //TESTING

  let getLowAccuracyPosition = () => {
    //cbError({message: '**TEST ERROR from getLowAccuracyPosition**'}); return; //TESTING
    console.log('***REQUESTING POSITION, HIGH ACCURACY FALSE')
    navigator.geolocation.getCurrentPosition(
      position => {
        console.log('***POSITION NETWORK OK', position)
        cb(position.coords)
      },
      error => {
        cbError(error)
      },
      {
        enableHighAccuracy: false,
        timeout: timeout,
        maximumAge: 0
      }
    )
  }
 
  // highAccuracy, via GPS, is the default option
  if (highAccuracy) {
    //cbError({message: '**TEST ERROR from getHighAccuracyPosition**'}); return; //TESTING
    console.log('***REQUESTING POSITION, HIGH ACCURACY TRUE')
    const watchId = navigator.geolocation.watchPosition(
      position => {
        // location retrieved
        highAccuracySuccess = true
        console.log('***POSITION GPS OK', position)
        navigator.geolocation.clearWatch(watchId)
        cb(position.coords)
      },
      error => {
        console.log(error)
        highAccuracyError = true
        navigator.geolocation.clearWatch(watchId)
        getLowAccuracyPosition()
      },
      {
        enableHighAccuracy: true,
        timeout: timeout,
        maximumAge: 0,
        distanceFilter: 1
      }
    )
  }
 
  setTimeout(() => {
    if (!highAccuracySuccess && !highAccuracyError) {
      getLowAccuracyPosition()
    }
  }, timeout)
}