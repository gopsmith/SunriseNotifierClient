import React, { Component } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Button,
  Linking,
  Dimensions,
  ImageBackground,
  ActivityIndicator,
  PushNotificationIOS,
  AppState,
  AsyncStorage,
} from 'react-native';

import * as GeoLocation from './Geolocation';
import * as Servers from './ServerUtilities'
import { getBackgroundImageFile } from './ImageBackground';
import { GOOGLE_API_KEY, SUNRISE_API_PW } from './Constants';

let DeviceInfo = require('react-native-device-info');

//this is not strictly a constant, but is treated that way, set only once
let BKGD_IMAGE_FILE = getBackgroundImageFile();

const GET_TIME_TIMER = 1000;
const UPDATE_DATA_AND_SERVER_TIMER = 60000;  //normally 60000; set it to 5000 for geolocation-change testing
const GEOLOCATION_TIMEOUT = 10000;  // 10 sec. is recommended
const FETCH_TIMEOUT = 4000;   // don't set this to less than 4 sec.

function getTime() {
  //better solution might be to use the library http://momentjs.com/
  // import moment from 'moment';  //JS date library
  const today = new Date();
  return {
    date: today.toDateString(),
    time: today.toLocaleTimeString()
  };
  //do I need this?:
  // import KeepAwake from 'react-native-keep-awake'; (github)
}

export default class App extends React.Component {
  constructor(props) {
    super(props);
    let currentTime = getTime();

    //put variables in state only if they directly affect the component's rendering
    this.state = {
      date: currentTime.date,
      time: currentTime.time,
      latitude: '',
      longitude: '',
      accuracy: '',
      locationName: '',
      firstSunEvent: '',
      secondSunEvent: '',
      isLoading: false,
      message: '',
      isPortraitMode: true,
      showDetailsButton: false,
      showLocationButton: false,
    };
  }

  //class instance variables
  uniqueID = DeviceInfo.getUniqueID(); // this is called uuid, in Sunrise Server
  deviceToken = '';  //this is called device_id, in Sunrise Server
  prevLatitude = '';
  prevLongitude = '';
  sunrise = '';
  sunset = '';
  currentTimeSlot = -1;
  shouldUpdateServer = false;  //whether or not to update the Sunrise Server
  serverWasUpdated = false;  //when true, the Data/Server "Tap for info" button will be displayed, once
  appState = '';


  //NOTE  BIG POTENTIAL ISSUE with this.setState(): it's not guaranteed to be synchronous; calls may be batched.
  //If you need to be sure the state was mutated, code a CALLBACK function as 2nd argument to setState().
  //https://stackoverflow.com/questions/30782948/why-calling-react-setstate-method-doesnt-mutate-the-state-immediately
  //https://stackoverflow.com/questions/42038590/when-to-use-react-setstate-callback

  componentWillMount() {
    AppState.addEventListener('change', this.handleAppStateChange);

    //when screen orientation changes between portrait and landscape, log to the console
    Dimensions.addEventListener("change", this.handleDimensionsChange);

    //update the date/time
    setInterval(() => {
      this.setState(getTime());
    }, GET_TIME_TIMER);

    //see if geoloc. changed, see if we need to get new sunrise/sunset, update server
    setInterval(() => {
      // *** THIS IS THE MAIN EVENT ***
      this.updateDataAndRefreshServer();
    }, UPDATE_DATA_AND_SERVER_TIMER);

    // listen for possible PushNotification Registration error
    PushNotificationIOS.addEventListener('registrationError', (obj) => {
      //obj: {message: string, code: number, details: any}
      console.log('*** ERROR REGISTERING for Push Notifs & getting device token' +
                  ` (Sunrise/Sunset server will never be updated): ${obj.message}`);
      this.setState({message: '(Demo Mode: no push notifications)'});
      alert('Unable to register your device for Push Notifications.' + 
        '\n\nIf you want to try again, close and restart the app when the network is available.');
        // what about if they simply decined the Push registration??
    });
  }

  componentWillUnmount() {
    console.log('***SunTimes is about to UNMOUNT');
    AppState.removeEventListener('change', this.handleAppStateChange);
  }

  componentDidMount() {
    console.log (`***DeviceInfo.getDeviceId: ${DeviceInfo.getDeviceId()}`);
    console.log (`***DeviceInfo.getUniqueID: ${this.uniqueID}`);

    PushNotificationIOS.requestPermissions();
    navigator.geolocation.setRNConfiguration({skipPermissionRequests: false});
    navigator.geolocation.requestAuthorization();

    // register for Push Notications, update position/sunTimes data and refresh server
    try {
      PushNotificationIOS.addEventListener ('register', (token) => {
        console.log(`***You are registered and the device token is: ${token}`);
        this.deviceToken = token;
        this.updateDataAndRefreshServer();
      });
    }
    catch(e) {
      console.log(`*** FAILED TO REGISTER FOR PUSH NOTIFICATIONS! Error: ${e}`);
    };

    // handle Push Notifications within the app
    PushNotificationIOS.addEventListener('notification', (notification) => {
      console.log(`***You have received a new notification!:\n\n${notification.getMessage()}`);
      alert(`Notification from SunTimes:\n\n${notification.getMessage()}`);
      //there's also notification.getSound(), but React Native doesn't natively support playing sound!

      PushNotificationIOS.getApplicationIconBadgeNumber( (number) => {
        if (number > 0)
          PushNotificationIOS.setApplicationIconBadgeNumber(number - 1);
      });

      notification.finish(PushNotificationIOS.FetchResult.NoData);  // not .NewData ?
    });

    //NOTE: AppState.currentState will always return null ("unknown") throughout componentDidMount()
    console.log(`***finished componentDidMount(); appState = ${AppState.currentState}`);
  }

  handleAppStateChange = (nextAppState) => {
    if (this.appState.match(/inactive|background/) && nextAppState === 'active') {
      console.log(`***App has come to the foreground! appState: from ${this.appState} to ${nextAppState}`)
      this.updateDataAndRefreshServer();
      //this.setState({ showDetailsButton: true });
    }
    else {
      console.log(`***appState is now changing from ${this.appState} to ${nextAppState}`)
    }
    this.appState = nextAppState;
  }

  handleDimensionsChange = (dimensions) => {
    //the BackgroundImage is set to "stretch", so this method is just for console messages
    console.log (`***NEW DIMENSIONS: ${dimensions.window.width} x ${dimensions.window.height}`);
    console.log (`***ORIENTATION CHANGING TO: ${this.state.isPortraitMode ? "landscape" : "portrait"}`);
    this.setState(this.state.isPortraitMode ? {isPortraitMode: false} : {isPortraitMode: true} );
  }

  //*** This is the MAIN EVENT "LOOP" ***
  updateDataAndRefreshServer = () => {
    let latitude, longitude;
    let sunrise, sunset;

    console.log(`**BEGIN MAIN EVENT; appState = ${AppState.currentState}, shouldUpdateServer = ${this.shouldUpdateServer}, serverWasUpdated = ${this.serverWasUpdated}`);

    try {
      // static multiGet(keys: Array<string>, [callback]: ?(errors: ?Array<Error>, result: ?Array<Array<string>>) => void)
      AsyncStorage.multiGet(['sunrise', 'sunset', 'deviceToken'],  //not currently using the stored latitude, longitude
        (err, stores) => {
          if (err !== null) {
            console.log(`*** multiGet error: ${err}`);
          }
          else if (stores !== null) {
            // We have data!!
            console.log(`***AsyncStorage multiGet: stores = ${stores}`);
            sunrise = stores[0][1];
            sunset = stores[1][1];
            deviceToken = stores[2][1];

            // has the device token changed?
            if (deviceToken != this.deviceToken) {  //deviceToken is last stored value; this.state is CURRENT token
              console.log(`***** DEVICE TOKEN CHANGED! -from- ${deviceToken}, -to- ${this.deviceToken}`);
              this.shouldUpdateServer = true;
              this.persistState();  // update stored value 'deviceToken'
            }

            // 1) get current geo location (https://www.abidibo.net/blog/2017/11/23/geolocation-react-native)
            // Note that the default option is HIGH ACCURACY
            GeoLocation.getLocation (
              (position) => {
                latitude = position.latitude;
                longitude = position.longitude;
                this.setState({accuracy: position.accuracy});    // in meters!
                console.log(`***got Geolocation: -was- ${this.state.latitude}, ${this.state.longitude}, -now- ${latitude}, ${longitude},`);

                // did the geo loc. change?
                if (this.state.latitude != latitude || this.state.longitude != longitude) { //this.state is prev. value
                  console.log(`***** GEO LOCATION CHANGED! -from- ${this.state.latitude}, ${this.state.longitude}, -to- ${latitude}, ${longitude},`);
                  this.shouldUpdateServer = true;
                  this.prevLatitude = this.state.latitude;
                  this.prevLongitude = this.state.longitude;
                  this.setState ({
                    latitude: latitude,
                    longitude: longitude,
                    locationName: this.getLocationName(latitude, longitude),
                    message: '',
                    //showLocationButton: true,
                  });
                }

                // 2) get next Sunrise/Sunset times, IF we just passed the next sunrise OR sunset time or the times are unknown
                // 3) store to Sunrise Server if needed
                if (Servers.shouldUpdateSunTimes(sunrise, sunset, this.currentTimeSlot)) {
                  //NOTE: if SunTimes _are_ updated, then server update must happen within getSunTimesAndUpdateServer's callback
                  this.getSunTimesAndUpdateServer('today');
                }
                else if (this.shouldUpdateServer) {  //SunTimes were not updated, but we might still need to update the server
                  this.sendToServer();
                  console.log(`*** after sendToServer(): shouldUpdateServer = ${this.shouldUpdateServer}`)
                }
              },
              (error) => {
                this.setState ({
                  latitude: 'unavailable',
                  longitude: 'unavailable',
                  locationName: '',
                });
                if (this.state.firstSunEvent == '') {
                  this.setState ({
                    message: 'Unable to determine your location -' +
                             ' Sunrise/Sunset times cannot be determined without it.' + 
                             ' To enable location services, go to Settings > Privacy > Location Services and' +
                             ' find "SunriseNotifier"',
                  });
                } else {
                  this.setState ({
                    message: '(Unable to determine your location - displaying' +
                             ' previously-retrieved Sunrise/Sunset times)',
                            });
                }
                console.log(`*** GeoLocation.getLocation REJECTED, error = ${error.message}`);
              },
              {
                timeout: GEOLOCATION_TIMEOUT,
                highAccuracy: true,  //set to true. 'highAccuracy' is correct key for the wrapper function in GeoLocation.js
                maximumAge: 0
              }
            );
          }
        }
      );

    } catch (error) {
      console.log(`*** multiGet caught an error: ${error}`);

    } finally {
      console.log(`**END MAIN EVENT; appState = ${AppState.currentState}, shouldUpdateServer = ${this.shouldUpdateServer}, serverWasUpdated = ${this.serverWasUpdated}`);
    }
  };

  getLocationName = (latitude, longitude) => {
    const query = Servers.urlForGoogleGeocodeQuery(latitude, longitude, GOOGLE_API_KEY);
  
    // get the name for the location:
    Servers.fetchWithTimeout(query, FETCH_TIMEOUT)
      .then(
        (response) => response.text()
          .then(
            (responseText) => {
              responseObj = JSON.parse(responseText);
              if (responseObj.status == 'OK') {
                console.log (`*** getLocationName returned: ${responseObj.results[0].formatted_address}`);
                this.setState({locationName: responseObj.results[0].formatted_address, message: ''});
              }
              else {
                console.log(`*** getLocationName returned: ${responseObj.status}`)
              }
            },
            (error) => this.reportGetLocationNameError(error)
          ),
        (error) => this.reportGetLocationNameError(error)
      )
      .catch(
        (error) => this.reportGetLocationNameError(error)
      )
  };

  reportGetLocationNameError = (error) => {
    this.setState({
      isLoading: false,
      message: `(unable to get the Location Name)`,
    })
    console.log('*** getLocationName error: ', error); // string interp. N/G for error OBJECT
  };
  
  getSunTimesAndUpdateServer = (day, savedSunTimes) => {
    const query = Servers.urlForSunTimesQuery(this.state.latitude, this.state.longitude, day);
    if (savedSunTimes) console.log(`***getSunTimesAndUpdateServer: savedSunTimes.sunrise = ${savedSunTimes.sunrise}`);
    this.setState({ isLoading: true, message: '' });
    //this.reportSunTimesFetchError({message: '**TEST ERROR from getSunTimesAndUpdateServer**'}); return; //TESTING

    // 1) get the next Sunrise/Sunset times:
    Servers.fetchWithTimeout(query, FETCH_TIMEOUT)
      .then(
        (response) => response.text()
          .then(
            (responseText) => this.dataAndServerUpdate(responseText, day, savedSunTimes),
            (error) => this.reportSunTimesFetchError(error)
          ),
        (error) => this.reportSunTimesFetchError(error)
      )
      .catch(
        (error) => this.reportSunTimesFetchError(error)
      );
  };

  reportSunTimesFetchError = (error) => {
    this.setState({
      isLoading: false,
      message: 'Unable to get the next Sunrise/Sunset times. Showing previously-retrieved times.' +
               ' (I\'ll try again when you have a working internet connection.)',
    });
    console.log(`*** SunTimes query error: ${error.message}`);
  };

  dataAndServerUpdate = (responseText, day, savedSunTimes) => {
    this.setState({ isLoading: false, message: '' });
    sunTimes = Servers.unpackSunTimes(JSON.parse(responseText));
    console.log(`***getSunTimesAndUpdateServer.then, day = ${day}; shouldUpdateServer = ${this.shouldUpdateServer}; savedSunTimes = ${savedSunTimes}; sunTimes.sunset = ${sunTimes.sunset}`);
    
    if (day == 'today') {
      currentTimeSlot = Servers.getCurrentTimeSlot(sunTimes);
      console.log (`***getSunTimesAndUpdateServer.then 'today', currentTimeSlot = ${currentTimeSlot}; shouldUpdateServer = ${this.shouldUpdateServer}`);

      if (currentTimeSlot == 0)  {
        this.setState({
          firstSunEvent: `Sunrise: ${sunTimes.sunriseStr}`,
          secondSunEvent: `Sunset: ${sunTimes.sunsetStr}`,
          message: '',
        });
        this.sunrise = sunTimes.sunrise;
        this.sunset = sunTimes.sunset;
        this.currentTimeSlot = currentTimeSlot;   // has to be 0

        this.persistState(currentTimeSlot);
      }

      else {
        // if current time is between sunrise and sunset, then get tomorrow's sun times too:
        this.getSunTimesAndUpdateServer('tomorrow', sunTimes);
      }

      // Send device info to our Sunrise SERVER - ONLY if flag has been set and all data are ready
      // NOTE: this depends on the async-updated SunTimes, so it must be done within current callback
      console.log(`***in dataAndServerUpdate: shouldUpdateServer = ${this.shouldUpdateServer}`);
      if (this.shouldUpdateServer) {
        this.sendToServer();
      }
    }

    else {    //day == 'tomorrow', sunTimes == tomorrow's times; savedSunTimes == today's sunTimes
      savedTimeSlot = Servers.getCurrentTimeSlot(savedSunTimes);   // curr. time compared only to today's sunTimes - has to be 1 or 2
      currentTimeSlot = Servers.getCurrentTimeSlot(sunTimes);    // curr. time compared only to tomorrow's sunTimes - has to be 0
      console.log (`***getSunTimesAndUpdateServer.then 'tomorrow', savedTimeSlot = ${savedTimeSlot}, currentTimeSlot = ${currentTimeSlot}`);

      this.setState({
        firstSunEvent: savedTimeSlot == 2 ? `Sunrise: ${sunTimes.sunriseStr}` : `Sunset: ${savedSunTimes.sunsetStr}`,
        secondSunEvent: savedTimeSlot == 2 ? `Sunset: ${sunTimes.sunsetStr}` : `Sunrise: ${sunTimes.sunriseStr}`,
        message: '',
      });
      this.sunrise = sunTimes.sunrise;
      this.sunset = savedTimeSlot == 2 ? sunTimes.sunset : savedSunTimes.sunset;
      this.currentTimeSlot = currentTimeSlot;   // has to be 0

      this.persistState();
    }
  };

  sendToServer = () => {
    const areDataReady = Boolean(this.state.latitude) && Boolean(this.state.longitude) && Boolean(this.deviceToken);
    console.log(`***b4 chk 4 sendToServer: SEND_DI? = ${areDataReady}`);

    if (areDataReady) {
      const [url, data] = Servers.urlAndDataForSunriseServer(this.state.latitude, this.state.longitude, this.uniqueID, this.deviceToken, SUNRISE_API_PW);
      this.setState({ isLoading: true, message: '' });
      this.serverWasUpdated = false;
      //this.reportSendToServerError({message: '**TEST ERROR from sendToServer**'}, data); return; //TESTING

      Servers.fetchWithTimeout(url, FETCH_TIMEOUT, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: data,
      })
        .then(
          (response) => {
            this.shouldUpdateServer = false;
            this.serverWasUpdated = true;
            this.setState({ isLoading: false, message: '' })
            console.log(`***SunriseServer update successful! shouldUpdateServer = ${this.shouldUpdateServer}, serverWasUpdated = ${this.serverWasUpdated}, data = ${data}`);
          },
          (error) => this.reportSendToServerError(error, data)
        )
        .catch(
          (error) => this.reportSendToServerError(error, data)
        );
    }
  };

  reportSendToServerError = (error, data) => {
    this.setState({
      isLoading: false,
      message: 'Your location changed, but we couldn\'t update our Sunrise server.' +
               ' Until the network is available, notifications will be based on your last location.',
    });
    this.serverWasUpdated = false;
    console.log('*** SunriseServer update error: ', error, '; data = ', data); // string interp. N/G for error OBJECT
  };

  persistState = () => {
    // update locally-stored lat/long/sunrise/sunset:
    // static multiSet(keyValuePairs: Array<Array<string>>, [callback]: ?(errors: ?Array<Error>) => void)
    AsyncStorage.multiSet([
        ['latitude', this.state.latitude.toString()],
        ['longitude', this.state.longitude.toString()],
        ['sunrise', this.sunrise.toString()], //this is local time; UTC time probably wouldn't be better
        ['sunset', this.sunset.toString()],
        ['deviceToken', this.deviceToken],
      ],
      (err) => {
        if (err !== null) {
          console.log(`*** multiSet error: ${err}`);
          //TODO: handle the error!
        }
      }
    );
  };
  
  showLocationChange = () => {
    alert(`YOUR GEOLOCATION CHANGED!\n\nWAS:\n${this.prevLatitude}, ${this.prevLongitude}\n\nNOW:\n${this.state.latitude}, ${this.state.longitude},`);
    this.setState({ showLocationButton: false });
  }

  showCredits = () => {
    alert("SUNRISE/SUNSET NOTIFIER\n\nDeveloper: Amigo Software Labs" +
          "\nSun Data: sunrise-sunset.org\nLocation Name: Google Geocoding API" + 
          `\n\nID-TOKEN: ${this.deviceToken}\n\nUUID: ${this.uniqueID}`);
  }

  openTermsPrivacyPage = () => {
    Linking.openURL("http://amigosoftwarelabs.com");
  }

  render() {
    const spinner = this.state.isLoading ? <ActivityIndicator size='large'/> : null;
    return (
      <View style={styles.container}>
        <ImageBackground
          style={styles.backgroundImage}
          source={BKGD_IMAGE_FILE}
          resizeMode="stretch"
        >
          <Text style={styles.timeText}>
            {this.state.time}
          </Text>
          <Text style={styles.dateText}>
            {this.state.date}
          </Text>
          {spinner}
          <Text>

          </Text>
          <Text style={styles.sunTimesText}>
            {this.state.firstSunEvent}
          </Text>
          <Text style={styles.sunTimesText}>
            {this.state.secondSunEvent}
          </Text>
          <Text>
            
          </Text>
          <Text style={styles.geoLocationText}>
            Latitude: {this.state.latitude}
          </Text>
          <Text style={styles.geoLocationText}>
            Longitude: {this.state.longitude}
          </Text>
          {/* <Text style={styles.geoLocationText}>
            Accuracy: {this.state.accuracy} meters
          </Text> */}
          <Text>

          </Text>
          <Text style={styles.geoLocationName}>
            {this.state.locationName}
          </Text>
          {this.state.message != '' &&
            <View>
              <Text>

              </Text>
              <Text style={styles.message}>
                {this.state.message}
              </Text>
            </View>
          }
          <Text>

          </Text>
          {this.state.showDetailsButton &&
            <Button
              color='#FFFFFF'
              onPress={this.showDeviceDetails}
              title="Data/Server updated? Tap for info!"
            />
          }
          {this.state.showLocationButton &&
            <Button
              color='#FFFFFF'
              onPress={this.showLocationChange}
              title="Geolocation changed. Tap for info!"
            />
          }
          <Button
            onPress={this.showCredits}
            color ='#FFFFFF'
            title="About/Credits..."
          />
          <Button
            onPress={this.openTermsPrivacyPage}
            color ='#000000'
            title='Terms of Use & Privacy Policy...'
          />
        </ImageBackground>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backgroundImage: {
    flex: 1,
    //leave out width: and height: - let the image load at its actual resolution & orientation
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  timeText: {
    color: '#000000',
    fontSize: 48,
  },
  dateText: {
    color: '#000000',
    fontSize: 36,
  },
  sunTimesText: {
    color: '#FFFFFF',
    //fontWeight: 'bold',
    fontSize: 20,
  },
  geoLocationText: {
    color: '#000000',
    fontSize: 18,
  },
  geoLocationName: {
    marginLeft: 10,
    marginRight: 10,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 16,
  },
  message: {
    marginLeft: 10,
    marginRight: 10,
    textAlign: 'center',
    color: '#000000',
    fontSize: 16,
  },
});