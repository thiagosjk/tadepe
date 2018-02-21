/*
    This file is part of TADEPÉ.

    TADEPÉ is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    TADEPÉ is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with TADEPÉ.  If not, see <http://www.gnu.org/licenses/>.
*/

// main app settings
var PRODUCTION = 'production';
var APPENV = 'production';
var storage = $.jStorage;
var DB = new Dexie("tadepe_60");
var TIME_UPDATE = (1000 * 60) * 10; // ten minutes
var TIME_INSPECTION = 1000 * 30; // 30 seconds
var BASE_URL = APPENV == PRODUCTION ? 'http://example.com' : 'http://ip:3000';
var API_URL = BASE_URL + '/api/'; // the API url
var POST_TOKEN = '';
var UUID = '';
var pushObj = null;

// define the tables to use for the localStorage data
DB.version(1).stores({
    schools: "id, name, address, latitude, longitude, status, deadline, progress, inspections_total, type, city",
    replies: "id, instance, text, deadline, replied_on, inspection_id, school_id",
    inspections: "id, text, photo, delayed, school_id, created_at", // seens that the photo attribute it's not being used
    photos: "id, photo, inspection_id", // it's not being used
    inspection_status: "id, instance, status, inspection_id, time",
    tmp_inspections: "id, text, *photos, school_id, inspection_id, lat, lon, comment"
});

// open the DB
DB.open().catch(function(error) {
    console.log('Dexie Error', error);
});

// configure the main Angular module with cloud, sanitize and cordova
// the Ionic cloud configuration can be changed for any Ionic Cloud account, the push notification
// because the Push notification is using a FCM integration
var tdp = angular.module('tdp', ['ionic', 'ngAnimate', 'ngSanitize', 'ngStorage', 'ngCordova', 'angularMoment', 'ionic-cache-src', 'ngRaven'])
    .config(function($stateProvider, $urlRouterProvider) {
        $stateProvider
            // this is the main route of the app
            .state('tutorial', {
                url: '/',
                cache: false,
                templateUrl: 'templates/tutorial.html',
                controller: 'TutorialController'
            })
            // this route holds all the close by schools
            .state('schools', {
                url: '/schools',
                cache: true,
                templateUrl: 'templates/schools.html',
                controller: 'SchoolsController'
            })
            // the school detail
            .state('school', {
                url: '/school/:id',
                cache: false,
                templateUrl: 'templates/school.html',
                controller: 'SchoolController'
            })
            // this is the list of cards that are not shown on the school detail
            .state('cards', {
                url: '/cards/:id/:slug',
                cache: false,
                templateUrl: 'templates/cards.html',
                controller: 'CardsController'
            })
            // this is the interface to take photos
            .state('photos', {
                url: '/photos',
                cache: false,
                templateUrl: 'templates/photos.html',
                controller: 'PhotosController'
            })
            // this show success or fail from the API response
            .state('sent', {
                url: '/sent',
                cache: false,
                templateUrl: 'templates/sent.html',
                controller: 'SentController'
            })
        $urlRouterProvider.otherwise('/');

    })
    // configure analytics and keyboard
    .run(function($ionicPlatform, $ionicPopup, amMoment, $ionicLoading, $rootScope, $cordovaDevice) {
        $ionicPlatform.ready(function() {
            UUID = $cordovaDevice.getUUID();

            if (window.cordova && window.cordova.plugins.Keyboard) {
                cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
                cordova.plugins.Keyboard.disableScroll(true);
            }
            if (window.StatusBar) {
                StatusBar.styleDefault();
            }
            if (typeof analytics !== undefined) {
                window.ga.startTrackerWithId("");
                window.ga.setAllowIDFACollection(true);
                console.log("Google Analytics Available");
            } else {
                console.log("Google Analytics Unavailable");
            }

            // Push notification Stuff

            var pushConfigs = {
                android: {
                    senderID: 00000000000,
                    iconColor: '#343434'
                },
                ios: {
                    badge: true,
                    sound: true
                }
            };

            pushObj = PushNotification.init(pushConfigs);

            pushObj.on('registration', function (data) {
                console.log('registrationId', data.registrationId)
                storage.set('push_token', data.registrationId);
            });

            pushObj.on('error', function(e) {
                console.log('notification error', e)
            });

            //-- Push notification Stuff

            amMoment.changeLocale('pt-br');

            checkGPSonORoff();

            // check for app updates
            codePush.sync(null, {
                installMode: InstallMode.ON_NEXT_RESTART,
                mandatoryInstallMode: InstallMode.ON_NEXT_RESTART
            });

            /** Notification stuff */
            cordova.plugins.notification.local.on("click", function (notification) {
                setTimeout(function(){
                    $ionicLoading.show({
                        template: 'Aguarde...'
                    }).then(function() {
                        setTimeout(function(){
                            $ionicLoading.hide();
                        }, 30000);
                    })
                }, 5000);
                // $rootScope.sendInspections();
            });

            $rootScope.$on('loading:show', function() {
                $ionicLoading.show({template: 'Aguarde...'})
            });

            $rootScope.$on('loading:hide', function() {
                $ionicLoading.hide()
            });

        });

    });

var watchID;

// when we are able to get the user location
function onSuccessLocation(position) {
    LOCATION.lat = position.coords.latitude;
    LOCATION.lon = position.coords.longitude;
    console.log(LOCATION.lat, LOCATION.lon);
}

// we do not need the error on this case
function onErrorLocation(error) {
    console.log(error.code, error.message);
}

// check if GPS is enabled when we need it
function checkGPSonORoff() {

    if (!cordova.plugins.diagnostic) {
        setTimeout(checkGPSonORoff, 1000);
        return;
    }

    cordova.plugins.diagnostic.isLocationEnabled(function(enabled) {
        if (enabled) {
            watchID = navigator.geolocation.watchPosition(onSuccessLocation, onErrorLocation, {
                timeout: 20000,
                enableHighAccuracy: true,
                maximumAge: 10000
            });
        } else {
            setTimeout(checkGPSonORoff, 1000);
        }
    }, function(error) {
        setTimeout(checkGPSonORoff, 1000);
    });
}

// we start at 0 to compare and check after we try to receive the location
var LOCATION = {
    lat: 0,
    lon: 0
};

tdp.controller("MainController", function($rootScope, $scope, $state, $location, $ionicHistory, $ionicLoading, $cordovaGeolocation, $ionicModal, $ionicPopup, $ionicPlatform, $filter, $q, moment, $cordovaDevice) {


    $rootScope.modal = null;
    $rootScope.notificationData = {};

    // open the notification modal after we receive the payload
    $scope.openModal = function() {
        if ($rootScope.modal) {
            $rootScope.modal.hide();
        }
        $ionicModal.fromTemplateUrl('notification.html', {
                scope: $scope,
                animation: 'slide-in-up'
            })
            .then(function(modal) {
                $rootScope.modal = modal;
                $rootScope.modal.show();
                $rootScope.trackView('Visualizar notificação');
            });
    };

    $scope.closeModal = function() {
        $rootScope.modal.hide();
        if ($rootScope.notificationData.project_id) {
            $state.go('school', { id: $rootScope.notificationData.project_id });
        }
        $rootScope.trackEvent('Toque', 'Fechar', 'Notificacao', 0);
    };

    $rootScope.doNotRedirect = false;

    // parse the notification from the server
    $ionicPlatform.ready(function() {
        pushObj.on('notification', function(data) {

            if (data.additionalData && data.additionalData.project_id) {
                $rootScope.notificationData = {
                    title: data.title,
                    text: data.message,
                    date: data.additionalData.date,
                    reply_id: data.additionalData.reply_id,
                    inspection_id: data.additionalData.inspection_id,
                    project_id: data.additionalData.project_id,
                    reply: data.additionalData.reply,
                    instance: data.additionalData.instance,
                };
            } else {
                $rootScope.notificationData = {
                    title: data.title,
                    text: data.message,
                    date: data.additionalData.payload.date,
                    reply_id: data.additionalData.payload.reply_id,
                    inspection_id: data.additionalData.payload.inspection_id,
                    project_id: data.additionalData.payload.project_id,
                    reply: data.additionalData.payload.reply,
                    instance: data.additionalData.payload.instance,
                };
            }

            // if the notification is from a reply, we need to get the full text from the server, it
            // is too big for the payload
            var url = API_URL + 'projects/' + $rootScope.notificationData.project_id + '/inspections/' + $rootScope.notificationData.inspection_id + '/replies/' + $rootScope.notificationData.reply_id + '.json';

            if (!UUID) {
                UUID = $cordovaDevice.getUUID();
            }

            if ($rootScope.notificationData.reply != 'false') {
                axios({
                        url: url,
                        method: 'GET',
                        headers: {
                            'X-device-uuid': UUID,
                            'X-device-push-notification': storage.get('push_token'),
                        }
                    })
                    .then(function(response) {
                        $rootScope.notificationData.text = response.data.content;
                    })
                    .catch(function(error) {
                        console.log('error with url', url);
                    });
            }

            // update schools and set the current school for the scope
            $rootScope.updateSchools().then(function() {
                return $rootScope.parseSchools($rootScope.notificationData.project_id);
            }).then(function(schools) {
                    schools.forEach(function(school) {
                        if (school.id == $rootScope.notificationData.project_id) {
                            $scope.school = school;
                        }
                    });
                });

            if ($rootScope.notificationData.reply != 'false') {
                $scope.openModal();
            } else {
                $rootScope.doNotRedirect = true;
                $state.go('school', { id: $rootScope.notificationData.project_id });
            }
        });
    });


    // track all events using Analytics
    $rootScope.trackView = function(name) {
        if (typeof analytics !== 'undefined') {
            window.ga.trackView(name);
            console.log('Tracking view', name);
        } else {
            setTimeout(function() {
                if (typeof analytics !== 'undefined') {
                    window.ga.trackView(name);
                    console.log('Tracking view', name);
                }
            }, 3000);
        }
    }

    // track all events using Analytics
    $rootScope.trackEvent = function(category, action, label, value) {
        if (typeof analytics !== 'undefined') {
            window.ga.trackEvent(category, action, label);
            console.log('Tracking Event', category, action, label);
        } else {
            setTimeout(function() {
                if (typeof analytics !== 'undefined') {
                    window.ga.trackEvent(category, action, label);
                    console.log('Tracking Event', category, action, label);
                }
            }, 3000);
        }
    }

    // this colors are used on the "sent" screen
    $rootScope.colors = ['gray', 'yellow', 'green', 'red'];


    $rootScope.checkedOption = 0;
    $rootScope.selectedSchool;

    // all the template texts for the "sent" screen
    $rootScope.checks = [{
        icon: 'icon-fance',
        text: 'Já tem cerca?',
        percent: 11,
        late: 'A obra deveria ter começado. Sem tapumes, ela esta  atrasada.',
        not_late: 'O dia oficial para o início desta obra era há X dias. Ate agora, o governo está seguindo as datas combinadas!'
    }, {
        icon: 'icon-foundation',
        text: 'E fundações?',
        percent: 28,
        late: 'A obra já deveria estar na fase de escavação e fundações. Sem isso, ela esta atrasada.',
        not_late: 'Esta vendo a escavação de terra e construção das fundações? É sinal de que a obra está em dia.'
    }, {
        icon: 'icon-wall',
        text: 'Tem parede de pé?',
        percent: 55,
        late: 'A falta de paredes indica atraso. No plano da obra, elas já deveriam estar sendo construídas.',
        not_late: 'Tijolos, blocos e argamassa já montados são bons sinais. Checando as datas oficiais dessa obra, não há indícios de atraso.'
    }, {
        icon: 'icon-roof',
        text: 'E o telhado?',
        percent: 56,
        late: 'O telhado já deveria ter sido feito. A obra esta atrasada. Continue monitorando. É hora de agir.',
        not_late: 'Telhado é um bom sinal. Chegamos na metade! Agora entram revestimento, pisos, forro, elétrica e hidráulica .'
    }, {
        icon: 'icon-door',
        text: 'Portas e janelas?',
        percent: 78,
        late: 'Essa obra já deveria estar com a instalação de janelas com os vidros e portas de alumínio em andamento. Parece atrasada',
        not_late: 'O que você consegue ver parece corresponder ao plano organizado da obra. Por enquanto, tudo bem.'
    }];

    // back button for all the screens
    $rootScope.goBack = function() {
        $ionicHistory.goBack();
        $rootScope.trackEvent('Toque', 'Voltar', 'Navegação', 0);
    };

    // shared share scope for the app, there are 4 types of share (locations)
    $rootScope.share = function(number, school, inspection, reply, notification) {

        text = "";

        type = 'escola';
        if (school) {
            school.type = (school.type == 'kindergarten' ? 'creche' : 'escola')
        }

        if (number == 1) {
            if (inspection.status[1].status == 1 || inspection.status[1].status == 2) {
                text = 'Estou no pé da Prefeitura de ' + school.city + ' para a construção da ' + school.type + ' ' + school.name + '. #FiqueNoPé você também!';
            }
            if (inspection.status[2].status == 1 || inspection.status[2].status == 2) {
                text = $rootScope.translateInstance(inspection.status[2].instance, true);
                text = text + ' ' + $rootScope.translateInstance(inspection.status[2].instance, false);
                text = text + ' ' + 'recebeu um alerta sobre a ' + school.type + ' ' + school.name + '. #FiqueNoPé da Prefeitura de ' + school.city + ' você também!';
            }
        }

        if (number == 2) {
            text = $rootScope.translateInstance(reply.instance, true);
            text = text + ' ' + $rootScope.translateInstance(reply.instance, false);
            if (reply.deadline == -1) {
                if (text == 'O FNDE' || text == 'CGU') {
                    text = text + ' respondeu! A obra da ' + school.type + ' ' + school.name + ' está paralisada. #FiqueNoPé você também!';
                } else {
                    text = text + ' ' + 'de ' + school.city + ' respondeu! A obra da ' + school.type + ' ' + school.name + ' está paralisada. #FiqueNoPé você também!';
                }
            } else {
                if (text == 'O FNDE' || text == 'CGU') {
                    text = text + ' respondeu! A ' + school.type + ' ' + school.name + ' deverá ser entregue em ' + $filter('formatDateOnlyTwo')(notification.date) + '. #FiqueNoPé você também!';
                } else {
                    text = text + ' ' + 'de ' + school.city + ' respondeu! A ' + school.type + ' ' + school.name + ' deverá ser entregue em ' + $filter('formatDateOnlyTwo')(notification.date) + '. #FiqueNoPé você também!';
                }
            }
        }

        if (number == 3) {
            if (school.late == -1) {
                text = 'A construção da ' + school.type + ' ' + school.name + ' não tem previsão. #FiqueNoPé da Prefeitura de ' + school.city;
            } else {
                if (school.status == 'Em Execução') {
                    text = '#FiqueNoPé da Prefeitura de ' + school.city + ' para que a construção da ' + school.type + ' ' + school.name + ' fique em dia. Baixe o aplicativo "Tá de Pé"';
                } else {
                    text = 'A construção da ' + school.type + ' ' + school.name + ' está há ' + $filter('daysToVerbose')(school.late) + ' atrasada. #FiqueNoPé da Prefeitura de ' + school.city;
                }
            }
        }

        if (number == 4) {
            text = $rootScope.translateInstance(notification.instance, true);
            text = text + ' ' + $rootScope.translateInstance(notification.instance, false);
            if (!notification.date) {
                if (text == 'O FNDE' || text == 'CGU') {
                    text = text + ' respondeu! A obra da ' + school.type + ' ' + school.name + ' está paralisada. #FiqueNoPé você também!';
                } else {
                    text = text + ' ' + 'de ' + school.city + ' respondeu! A obra da ' + school.type + ' ' + school.name + ' está paralisada. #FiqueNoPé você também!';
                }
            } else {
                if (text == 'O FNDE' || text == 'CGU') {
                    text = text + ' respondeu! A ' + school.type + ' ' + school.name + ' deverá ser entregue em ' + $filter('formatDateOnlyTwo')(notification.date) + '. #FiqueNoPé você também!';
                } else {
                    text = text + ' ' + 'de ' + school.city + ' respondeu! A ' + school.type + ' ' + school.name + ' deverá ser entregue em ' + $filter('formatDateOnlyTwo')(notification.date) + '. #FiqueNoPé você também!';
                }
            }
        }

        text = text;

        if (device.platform === 'Android') {
            text += ' https://play.google.com/store/apps/details?id=br.com.tadepe';
        } else if (device.platform === 'iOS') {
            text += ' https://itunes.apple.com/br/app/t%C3%A1-de-p%C3%A9-fiscalize-a-escola/id1312975610?mt=8';
        }

        window.plugins.socialsharing.shareWithOptions({
            message: text,
            subject: 'Tá de Pé',
            files: [''],
            url: '',
            chooserTitle: 'Escolha como compartilhar'
        }, function(msg) {}, function(msg) {});
        $rootScope.trackEvent('Toque', 'Abrir', 'Share', 0);
    }

    // calculate the distance between the user and the school
    $rootScope.distanceFrom = function(lat, lon) {
        if (!lat || !lon) {
            return undefined
        }
        var R = 6371; // km
        var dLat = toRad(lat - LOCATION.lat);
        var dLon = toRad(lon - LOCATION.lon);
        var lat1 = toRad(LOCATION.lat);
        var lat2 = toRad(lat);

        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        var d = R * c;
        return d.toFixed(1);
    }

    // we just need a proxy function for this purpose
    $rootScope.getUserLocation = function(callback) {
        callback(LOCATION);
    }

    // this method is responsible for parsing the school from the server and providing the app
    // additional information so we can populate the screens
    $rootScope.formatSchool = function(school) {
        var date = null;
        var late = -1;
        if (school.deadline) {
            date = moment(school.deadline, "YYYY-MM-DD");
        } else {
            date = null;
        }

        if (school.evidence_photo) {
            if (APPENV == PRODUCTION) {
                school.evidence_photo = school.evidence_photo;
            } else {
                school.evidence_photo = BASE_URL + school.evidence_photo;
            }
        } else {
            school.evidence_photo = null;
        }

        school.late = late;
        if (date) {
            school.deadline = date;
            var now = moment();
            if (date.unix() < now.unix()) {
                late = Math.ceil(Math.abs(now.valueOf() - date.valueOf()) / (1000 * 3600 * 24));
            } else {
                late = 0
            }
            school.late = late;

            if (date.unix() > now.unix()) {
                if (school.status == 'Execução') {
                    school.info = 'information-circled';
                    school.title = 'Em Execução';
                    school.status = 'Em Execução';
                    school.card_content = 'O governo diz que a obra está em dia. Você notou algo errado?';
                    school.shareText = '#FiqueNoPé da Prefeitura para que a construção da creche/escola ' + school.name + ' fique em dia. Baixe o aplicativo "Tá de Pé"';
                } else if (school.status == 'Concluído') {
                    school.info = 'checkmark-circled';
                    school.title = 'Finalizada';
                    school.status = 'O governo diz que a obra está pronta. Ela está de pé?';
                    school.card_content = 'O governo diz que a obra está pronta. Ela está de pé?';
                    school.shareText = '';
                } else {
                    school.info = 'alert-circled';
                    school.title = 'Em andamento';
                    school.status = 'Em andamento sem sinal de atraso';
                    school.late = 0;
                    school.card_content = 'Em andamento sem sinal de atraso';
                    school.shareText = '#FiqueNoPé da Prefeitura para que a construção da creche/escola ' + school.name + ' fique em dia. Baixe o aplicativo "Tá de Pé"';
                }
            } else {
                if (late > 0) {
                    school.status = 'de atraso';
                    if (school.status == 'Inacabada') {
                        school.info = 'android-alert';
                        school.title = 'Em andamento';
                        school.status = 'O governo diz que a obra está parada. Fique no pé da Prefeitura!';
                        school.card_content = 'O governo diz que a obra está parada. Fique no pé da Prefeitura!';
                        school.shareText = '#FiqueNoPé da Prefeitura para que a construção da creche/escola ' + school.name + ' fique em dia. Baixe o aplicativo "Tá de Pé"';
                        school.shareText = '';
                    } else if (school.status == 'Paralisada') {
                        school.info = 'android-alert';
                        school.title = 'Paralisada';
                        school.status = 'O governo diz que a obra está parada. Fique no pé da Prefeitura!';
                        school.card_content = 'O governo diz que a obra está parada. Fique no pé da Prefeitura!';
                        school.shareText = 'A construção da escola ' + school.name + ' está há ' + $filter('daysToVerbose')(school.late) + ' atrasada. #FiqueNoPé da Prefeitura';
                    } else {
                        school.info = 'android-alert';
                        school.title = 'Obra atrasada';
                        school.status = 'de atraso';
                        school.card_content = 'de atraso';
                        school.shareText = 'A construção da escola ' + school.name + ' está há ' + $filter('daysToVerbose')(school.late) + ' atrasada. #FiqueNoPé da Prefeitura';
                    }
                } else {
                    school.info = 'android-alert';
                    school.title = 'Obra atrasada';
                    school.status = 'Sem previsão de entrega';
                    school.card_content = 'Você tem informações sobre esta obra?';
                    school.shareText = 'A construção da escola ' + school.name + ' está atrasada. #FiqueNoPé da Prefeitura';
                }
            }

        } else {
            school.info = 'alert-circled';
            school.title = 'Obra atrasada';
            school.status = 'Sem previsão de entrega';
            school.shareText = 'A construção da escola ' + school.name + ' está atrasada. #FiqueNoPé da Prefeitura';
        }

        if (!school.inspections) {
            school.inspections = [];
        }

        if (!school.replies) {
            school.replies = [];
        }

        return school;
    }

    $rootScope.onLine = navigator.onLine;

    // check internet connection
    $rootScope.checkConnection = function() {
        $rootScope.onLine = navigator.onLine;
        if (window.Connection) {
            if (navigator.connection.type == Connection.NONE) {
                $rootScope.onLine = false;
            } else {
                $rootScope.onLine = true;
            }
        }
        setTimeout($rootScope.checkConnection, 10000);
    }
    $rootScope.checkConnection();
    $rootScope.firstAllowed = true;

    // this is an async method to consume the API from time to time (top settings)
    // and populate the database
    $rootScope.updateSchoolsInterval = null;
    $rootScope.updateSchools = function() {

        if ($rootScope.updateSchoolsInterval != null) {
            clearInterval($rootScope.updateSchoolsInterval);
        }

        var deferred = $q.defer()

        if (!$rootScope.onLine) {
            if (!storage.get('opened')) {
                $ionicPopup.alert({
                    title: 'Ops!',
                    template: 'Você precisa de internet para abrir o APP pela primeira vez.'
                });
                $rootScope.firstAllowed = false;
            }
            // time to run the scheduled method
            $rootScope.updateSchoolsInterval = setTimeout($rootScope.updateSchools, TIME_UPDATE);
            deferred.resolve('notOnline');
            return deferred.promise;
        }

        if (LOCATION.lat == 0 && LOCATION.lon == 0) {
            $rootScope.updateSchoolsInterval = setTimeout($rootScope.updateSchools, 2000);
            deferred.resolve('noLocation');
            return deferred.promise;
        }

        if (!UUID) {
            UUID = $cordovaDevice.getUUID();
        }

        var constructions = [];
        var UUID_TO_SEND = UUID;

        axios({
            url: API_URL + 'projects/me.json',
            method: 'GET',
            headers: {
                'X-device-uuid': UUID_TO_SEND,
                'X-device-push-notification': storage.get('push_token'),
            },
            params: {
                latitude: LOCATION.lat,
                longitude: LOCATION.lon
            }
        })
        .then(function(response) {
            console.log(response.data);
            $rootScope.firstAllowed = true;

            constructions = response.data.constructions;

            return axios({
                url: API_URL + 'projects.json',
                method: 'GET',
                headers: {
                    'X-device-uuid': UUID_TO_SEND,
                    'X-device-push-notification': storage.get('push_token'),
                },
                params: {
                    latitude: LOCATION.lat,
                    longitude: LOCATION.lon
                }
            });
        })
        .then(function(response) {
            console.log(response.data);
            $rootScope.trackEvent('Atualizar', 'Lista', 'Escolas', 0);
            constructions = constructions.concat(response.data.constructions);
            return DB.schools.where("id").notEqual(0).delete();
        })
        .then(function(deleteCount) {
            var chain = $q.when();

            constructions.forEach(function(school) {
                var school = school;
                chain = chain.then(function() {
                    return DB.schools.put({
                        id: school.id,
                        name: school.name,
                        address: school.address,
                        latitude: school.location.latitude,
                        longitude: school.location.longitude,
                        status: school.status,
                        deadline: school.deadline,
                        progress: school.progress,
                        inspections_total: school.inspections_total,
                        type: school.type,
                        city: school.city,
                        evidence_photo: school.evidence_photo
                    })
                    .then(function() {
                        if (school.replies.length > 0) {
                            school.replies.forEach(function(reply) {
                                if (reply.id) {
                                    DB.replies.put({
                                        id: reply.id,
                                        instance: reply.instance,
                                        text: reply.text,
                                        deadline: reply.deadline ? new Date(reply.deadline) : -1,
                                        replied_on: new Date(reply.replied_on),
                                        inspection_id: reply.inspection,
                                        school_id: school.id,
                                    });
                                }
                            });
                        }
                    })
                    .then(function() {
                        if (school.inspections && school.inspections.length > 0) {
                            return DB.inspections.where("school_id").equals(school.id).delete();
                        }
                        return false;
                    })
                    .then(function(response) {
                        if (false === response) return false;
                        var inspectionStuffChain = $q.when();

                        school.inspections.forEach(function(inspection) {
                            if (!inspection.id) return;
                            inspectionStuffChain.then(function(){

                                var alertFromText = 'Seu alerta de ' + moment(inspection.created_at).format('DD/MM/YY') +' foi enviado para nossos engenheiros. Se eles encontrarem sinais de atraso, falaremos com o governo.'

                                var insp_save = {
                                    id: inspection.id,
                                    text: alertFromText,
                                    delayed: inspection.is_delayed,
                                    school_id: school.id,
                                    created_at: inspection.created_at
                                }

                                if (inspection.evidences[0] && inspection.evidences[0].image_url.length > 0) {
                                    insp_save.photo = inspection.evidences[0].image_url;
                                }
                                return DB.inspections.put(insp_save)
                                    .then(function() {
                                        if (!(inspection.status && inspection.status.length > 0)) return false;
                                        return DB.inspection_status.where("inspection_id").equals(inspection.id).delete();
                                    })
                                    .then(function() {
                                        var inspectionStatusPromises = [];

                                        inspection.status.forEach(function(status) {
                                            var instance = status.instance;

                                            if (instance == 'prefeitura') {
                                                instance = 'Prefeitura'
                                            } else if (instance == 'câmara municipal') {
                                                instance = 'Câmara'
                                            } else if (instance == 'ministério da educação') {
                                                instance = 'MDE'
                                            } else if (instance == 'fundo nacional de desenvolvimento da educação') {
                                                instance = 'FNDE'
                                            } else if (instance == 'controladoria-geral da união') {
                                                instance = 'CGU'
                                            } else {
                                                instance = ''
                                            }

                                            inspectionStatusPromises.push(DB.inspection_status.put({
                                                id: status.id,
                                                instance: instance,
                                                status: status.status,
                                                inspection_id: inspection.id,
                                                time: new Date().getTime()
                                            }));
                                        });

                                        return $q.all(inspectionStatusPromises);
                                    });
                            });
                        });

                        return inspectionStuffChain;
                    })
                })
            })

            return chain;
        })
        .then(function() {
            deferred.resolve(true);
        })
        .catch(function(err) {
            deferred.reject(err);
        });
        return deferred.promise;
    };

    // we cache all the offline photos to send when possible
    $rootScope.deleteTmp = function(inspection) {
        DB.inspections.put({
            id: inspection.inspection_id,
            text:  'Seu alerta de '+ moment().format('DD/MM/YY') +' foi enviado para nossos engenheiros. Se eles encontrarem sinais de atraso, falaremos com o governo.',
            photo: inspection.photo,
            delayed: true,
            school_id: inspection.school_id
        });
        DB.inspection_status.put({
            id: inspection.inspection_id + 1,
            instance: 'Alerta',
            status: 2,
            inspection_id: inspection.inspection_id,
            time: new Date().getTime()
        });
        DB.inspection_status.put({
            id: inspection.inspection_id + 2,
            instance: 'Avaliação',
            status: 1,
            inspection_id: inspection.inspection_id,
            time: new Date().getTime()
        });
        return DB.tmp_inspections.where("id").equals(inspection.id).delete();
    }

    // a scheduled method to send the inspections to the server from time to time
    $rootScope.isSendingInspections = false;
    $rootScope.sendInspections = function(manual) {

        if (!cordova.plugins || !$cordovaDevice) {
            if (manual) $rootScope.$broadcast('loading:hide')
            setTimeout(function() {
                $rootScope.sendInspections(manual)
            }, 3000);
            return;
        }

        if ($rootScope.isSendingInspections) return false;

        $rootScope.isSendingInspections = true;

        if (!$rootScope.onLine) {
            $rootScope.isSendingInspections = false;
            if (manual) $rootScope.$broadcast('loading:hide');
            console.log('not online to update inspections');
            setTimeout($rootScope.sendInspections, TIME_INSPECTION);
            return;
        }

        if (manual) $rootScope.$broadcast('loading:show');

        DB.tmp_inspections.toCollection().first()
            .then(function(inspection) {

                if (!inspection) {
                    $rootScope.isSendingInspections = false;
                    if (manual) $rootScope.$broadcast('loading:hide');
                    console.log('no inspection found')
                    setTimeout($rootScope.sendInspections, TIME_INSPECTION);
                    return
                };

                try {
                    if (inspection.inspection_id != '') {
                        sendEvidences({inspection: inspection, manual: manual})
                    } else {
                        sendInspection(inspection).then(function(inspectionId) {
                            inspection.inspection_id = inspectionId; // update inspection id from server
                        }).then(function() {
                            sendEvidences({inspection: inspection, manual: manual})
                        });
                    }
                } catch(err) {
                    $rootScope.$broadcast('loading:hide');
                }
            });
    };
    $rootScope.sendInspections();

    // FUNCTIONS RELATED TO SENDINSPECTIONS
    function sendInspection(inspection) {
        $rootScope.trackEvent('Receber', 'Vistoria', 'ID', 0);

        if (!UUID) {
            UUID = $cordovaDevice.getUUID();
        }

        var inspection_id = null; // inspection id from server
        return axios({
            url: API_URL + 'projects/' + inspection.school_id + '/inspections.json',
            data: {
                lat: LOCATION.lat,
                lon: LOCATION.lon,
                comment: inspection.comment
            },
            method: 'POST',
            headers: {
                'X-device-uuid': UUID,
                'X-device-push-notification': storage.get('push_token'),
                'post-token': POST_TOKEN
            }
        })
        .then(function(response) {
            inspection_id = response.data.id;
            return DB.transaction("rw", DB.tmp_inspections, function() {
                DB.tmp_inspections
                    .where('id')
                    .equals(inspection.id)
                    .modify(function(value, ref) {
                        ref.value.inspection_id = inspection_id;
                    });
            })
        }).then(function() {
            return inspection_id;
        })
        .catch(function(err) {
            console.log('err', err);
        });
    }

    function sendEvidences(options) {
        if (!UUID) {
            UUID = $cordovaDevice.getUUID();
        }

        var inspection = options.inspection;
        var manual = options.manual;
        var photos = (inspection.photos.length > 0) ? inspection.photos : [];
        var promises = [];

        $rootScope.trackEvent('Enviar', 'Photos', 'Vistoria', 0);
        photos.forEach(function(photo) {
            var r = axios({
                url: API_URL + 'projects/' + inspection.school_id + '/inspections/' + inspection.inspection_id + '/evidences.json',
                method: 'POST',
                headers: {
                    'X-device-uuid': UUID,
                    'X-device-push-notification': storage.get('push_token'),
                    'Content-Type': 'application/json; charset=utf-8',
                    'post-token': POST_TOKEN
                },
                data: {
                    evidence: {
                        image: photo.hash,
                        lat: photo.location.lat,
                        lon: photo.location.lon
                    }
                }
            });
            promises.push(r);
        });

        if (promises.length == 0) {
            $rootScope.deleteTmp(inspection).finally(function() {
                $rootScope.isSendingInspections = false;
                if (manual) $rootScope.$broadcast('loading:hide');
                $rootScope.sendInspections(manual);
            });
        } else {
            Promise.all(promises).then(function(values) {
                $rootScope.deleteTmp(inspection).finally(function() {
                    $rootScope.isSendingInspections = false;
                    if (manual) $rootScope.$broadcast('loading:hide');
                    $rootScope.sendInspections(manual);
                });
            }).catch(function(err){
                $rootScope.isSendingInspections = false;
                if (manual) $rootScope.$broadcast('loading:hide');
                console.log('error when trying to send evidences', err)
            });
        }
    }
    // --

    // this method will parse the schools (or school if id is provided) and organize the data
    // needed for the screen, with additional information and ordering (from distance)
    $rootScope.parseSchools = function(id) {
        var hasId = false;
        if (id) hasId = true;

        return new Dexie.Promise(function(resolve, reject) {
                if (id) {
                    DB.schools
                        .where('id')
                        .equals(parseInt(id))
                        .toArray()
                        .then(function(schools) {
                            if (schools.length == 0) {
                                reject('school_404');
                            } else {
                                resolve(schools);
                            }
                        })
                } else {
                    DB.schools
                        .toArray()
                        .then(function(schools) {
                            if (schools.length == 0) {
                                reject('schools_404');
                            } else {
                                resolve(schools);
                            }
                        })
                }
            })
            .then(function(schools) {
                return new Dexie.Promise(function(resolve, reject) {
                    schools.forEach(function(school, index) {
                        school = $rootScope.formatSchool(school);
                        DB.inspections
                            .reverse()
                            .sortBy('id')
                            .then(function(inspections) {
                                inspections.forEach(function(inspection) {
                                    if (inspection.school_id == school.id) {
                                        school.inspections.push(inspection);
                                    }
                                });
                                if (index == schools.length - 1) {
                                    resolve(schools);
                                }
                            });
                    });
                });
            })
            .then(function(schools) {
                return new Dexie.Promise(function(resolve, reject) {
                    schools.forEach(function(school, index) {
                        school.replies = [];
                        DB.replies
                            .toArray()
                            .then(function(replies) {
                                replies.forEach(function(reply) {
                                    if (reply.school_id == school.id) {
                                        school.replies.push(reply);
                                    }
                                });
                                if (index == schools.length - 1) {
                                    resolve(schools);
                                }
                            });
                    });
                });
            })
            .then(function(schools) {
                return new Dexie.Promise(function(resolve, reject) {
                    schools.forEach(function(school, index) {
                        DB.tmp_inspections
                            .toArray()
                            .then(function(inspections) {
                                inspections.forEach(function(inspection) {
                                    if (inspection.school_id == school.id) {
                                        school.inspections.push(inspection);
                                    }
                                });
                                if (index == schools.length - 1) {
                                    resolve(schools);
                                }
                            });
                    });
                });
            })
            .then(function(schools) {
                return new Dexie.Promise(function(resolve, reject) {
                    schools.forEach(function(school, index) {
                        school.inspections.forEach(function(inspection) {
                            inspection.status = [];
                            DB.inspection_status
                                .where('inspection_id')
                                .equals(inspection.id)
                                .reverse()
                                .sortBy('time')
                                .then(function(status) {
                                    inspection.status.push({
                                        id: 1,
                                        instance: "Alerta",
                                        status: 2,
                                        inspection_id: inspection.id
                                    });
                                    if (!inspection.delayed) {
                                        inspection.status.push({
                                            id: 2,
                                            instance: "Avaliação",
                                            status: 2,
                                            inspection_id: inspection.id
                                        });
                                        inspection.status.push({
                                            id: 2,
                                            instance: "",
                                            status: 0,
                                            inspection_id: inspection.id
                                        });
                                    } else {
                                        if (status.length == 0) {
                                            inspection.status.push({
                                                id: 2,
                                                instance: "Avaliação",
                                                status: 1,
                                                inspection_id: inspection.id
                                            });
                                        } else {
                                            if (status.length == 2) {
                                                var found = false;
                                                status.forEach(function(s) {
                                                    if (s.instance != 'Alerta' && s.instance != 'Avaliação') {
                                                        found = true;
                                                    }
                                                });
                                                if (found) {
                                                    inspection.status.push({
                                                        id: 2,
                                                        instance: "Avaliação",
                                                        status: 2,
                                                        inspection_id: inspection.id
                                                    });
                                                } else {
                                                    inspection.status.push({
                                                        id: 2,
                                                        instance: "Avaliação",
                                                        status: 1,
                                                        inspection_id: inspection.id
                                                    });
                                                }
                                            } else {
                                                inspection.status.push({
                                                    id: 2,
                                                    instance: "Avaliação",
                                                    status: 2,
                                                    inspection_id: inspection.id
                                                });
                                            }
                                            status.forEach(function(s) {
                                                if (s.instance != 'Alerta' && s.instance != 'Avaliação') {
                                                    inspection.status.push(s);
                                                }
                                            });
                                        }
                                        if (inspection.status.length < 3) {
                                            var s = inspection.status.length;
                                            for (var i = s; i < 3; i++) {
                                                inspection.status.push({
                                                    id: 1,
                                                    instance: "Prefeitura",
                                                    status: 0,
                                                    inspection_id: inspection.id
                                                });
                                            }
                                        } else {
                                            inspection.status = inspection.status.slice(inspection.status.length - 3);
                                        }
                                    }
                                });
                        });
                        if (index == schools.length - 1) {
                            var locationTimeout = 3000;
                            if (hasId) {
                                locationTimeout = 1200;
                            }
                            navigator.geolocation.getCurrentPosition(function(position) {
                                LOCATION.lat = position.coords.latitude;
                                LOCATION.lon = position.coords.longitude;

                                schools = schools.sort(function(a, b) {
                                    var keyA = Math.ceil($rootScope.distanceFrom(a.latitude, a.longitude)),
                                        keyB = Math.ceil($rootScope.distanceFrom(b.latitude, b.longitude));
                                    if (keyA < keyB) return -1;
                                    if (keyA > keyB) return 1;
                                    return 0;
                                });
                                schools.forEach(function(s, i) {
                                    if (s.inspections.length > 0) {
                                        schools.move(i, 0);
                                    }
                                });
                                resolve(schools);
                            }, function(error) {
                                schools = schools.sort(function(a, b) {
                                    var keyA = Math.ceil($rootScope.distanceFrom(a.latitude, a.longitude)),
                                        keyB = Math.ceil($rootScope.distanceFrom(b.latitude, b.longitude));
                                    if (keyA < keyB) return -1;
                                    if (keyA > keyB) return 1;
                                    return 0;
                                });
                                schools.forEach(function(s, i) {
                                    if (s.inspections.length > 0) {
                                        schools.move(i, 0);
                                    }
                                });
                                resolve(schools);
                            }, {
                                timeout: locationTimeout,
                                enableHighAccuracy: true,
                                maximumAge: 1000
                            });
                        }
                    });
                });
            })
    }

    // this is a FROM/TO method to normalize the instance names, used on all scopes
    $rootScope.translateInstance = function(instance, article) {
        if (instance == 'prefeitura') {
            instance = 'Prefeitura';
        } else if (instance == 'câmara municipal') {
            instance = 'Câmara';
        } else if (instance == 'ministério da educação') {
            instance = 'MDE';
        } else if (instance == 'fundo nacional de desenvolvimento da educação') {
            instance = 'FNDE';
        } else if (instance == 'controladoria-geral da união') {
            instance = 'CGU';
        }
        if (article) {
            if (instance == 'FNDE' || instance == 'MDE') {
                return 'O';
            } else {
                return 'A';
            }
        } else {
            return instance;
        }

    }

});

tdp.controller("TutorialController", function($rootScope, $scope, $state, $stateParams, $ionicPopup, $ionicLoading, $ionicHistory) {

    $state.showTutorial = false;

    if (storage.get('opened')) {
        $rootScope.parseSchools()
            .then(function(schools) {
                if (schools.length > 0) {
                    $ionicHistory.nextViewOptions({
                        disableAnimate: true
                    });
                    if (!$rootScope.doNotRedirect) {
                        $state.go('schools');
                    }
                } else {
                    $scope.showTutorial = true;
                }
            })
            .catch(function(err) {
                $state.go('schools');
            })
    } else {
        $scope.showTutorial = true;
    }

    $rootScope.trackView('Tutorial');
    $scope.slides = [
        'Você tira uma foto da escola em construção perto de você...',
        'Nossos engenheiros analisam e levam sua preocupação para o Governo.',
        'Fique tranquilo. É tudo anônimo e em nome da Transparência Brasil. \nVamos lá?'
    ];
    $scope.options = {
        loop: false,
        speed: 200,
    };

    $scope.goFoward = function() {
        console.log(LOCATION.lat, LOCATION.lon);
        if (LOCATION.lat == 0 || LOCATION.lon == 0) {
            $ionicPopup.show({
                title: null,
                template: '<center>Ligue a permissão de localização para que o app encontre escolas perto de você.<br><br></center>',
                scope: $scope,
                buttons: [{
                    text: 'Tentar novamente',
                    type: 'button-positive',
                    onTap: function(e) {
                        $scope.goFoward();
                    }
                }]
            });

        } else {
            $state.go('schools');
        }
    }

});

tdp.controller("SchoolsController", function($rootScope, $location, $ionicLoading, $scope, $state, $stateParams, $ionicPopup, $ionicPlatform) {
    $scope.haveSchools = true;
    $rootScope.trackView('Lista de escolas');
    storage.set('opened', true);
    $scope.schools = [];
    var tmp_schools = [];
    // var page = 0;
    // $scope.hasNext = false;
    $scope.headerMySchools = false;
    $scope.updateSchools = function() {
        // $rootScope.trackEvent('Atualizar', 'Lista', 'Escolas Proximas', 0);
        $ionicLoading.show({
            template: 'Aguarde...'
        }).then(function() {
            return $rootScope.updateSchools();
        }).then(function() {
            return $rootScope.parseSchools();
        }).then(function(schools) {
            tmp_schools = schools;
            $scope.schools = schools;
            // $scope.hasNext = true;
            if ($scope.schools.length > 0) {
                $scope.haveSchools = true;
            }
            schools.forEach(function(s) {
                if (s.inspections.length > 0) {
                    $scope.headerMySchools = true;
                }
            });
            $scope.$broadcast('scroll.refreshComplete');
            $ionicLoading.hide();
        })
        .catch(function(err) {
            $scope.haveSchools = false;
            // schools not found
            if ('Network Error' === err.message) {
                $ionicPopup.alert({
                    title: 'Problema na conexão!',
                    template: 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
                });
            }
            console.log(err);
            $ionicLoading.hide();
            $scope.$broadcast('scroll.refreshComplete');
        });
    }

    var registerLocationStateChangeHandler = function() {
        if (!cordova.plugins || !cordova.plugins.diagnostic) {
            setTimeout(registerLocationStateChangeHandler, 2000);
            return;
        }
        cordova.plugins.diagnostic.registerLocationStateChangeHandler(function (state) {
            if ((device.platform === "Android" && state !== cordova.plugins.diagnostic.locationMode.LOCATION_OFF)
                || (device.platform === "iOS") && ( state === cordova.plugins.diagnostic.permissionStatus.GRANTED
                    || state === cordova.plugins.diagnostic.permissionStatus.GRANTED_WHEN_IN_USE
                )) {
                $scope.updateSchools();
            }
        });
    }
    if (cordova.plugins && cordova.plugins.diagnostic) registerLocationStateChangeHandler();
    else setTimeout(registerLocationStateChangeHandler, 2000);

    $ionicLoading.show({
        template: 'Aguarde...'
    }).then(function() {
        navigator.geolocation.getCurrentPosition(function(position) {
            LOCATION.lat = position.coords.latitude;
            LOCATION.lon = position.coords.longitude;
            $scope.updateSchools();
        }, function(error) {
            $scope.updateSchools();
        }, {
            timeout: 3000,
            enableHighAccuracy: true,
            maximumAge: 2000
        });
    });

    var doCustomBack = function() {
        console.log('back cancelled')
    };
    var deregisterHardBack = $ionicPlatform.registerBackButtonAction(
        doCustomBack, 101
    );
});

tdp.controller("SchoolController", function($scope, $rootScope, $state, $stateParams, $ionicHistory, $ionicModal, $ionicScrollDelegate, $ionicLoading, $ionicPlatform, $ionicPopup) {
    var id = $stateParams.id;

    storage.set('current_school', id);

    $scope.school = {};

    $scope.show = false;

    // $ionicLoading.show({
    //     template: 'Aguarde...'
    // });
    $ionicLoading.show({
        template: 'Carregando informações...'
    });
    $rootScope.parseSchools(id)
        .then(function(schools) {
            schools.forEach(function(school) {
                if (school.id == id) {
                    $scope.school = school;
                    $rootScope.trackView('Detalhe escola: ' + school.name);
                    $scope.show = true;
                }
            });
            $ionicLoading.hide();
            setTimeout(function() {
                $scope.resize();
            }, 2000);
        });
    // $('.swiper-pagination').css({ display: "none" });
    $scope.resize = function() {
        var max = 0;
        var min = 200;
        $('.card').each(function() {
            if ($(this).height() > max) {
                max = $(this).height();
            }
        });
        if (max < min) {
            max = min;
        }
        $('.card').height(max + 10);
        // $('.item-text-wrap').height(max - 113);
        $('.slides').height(max + 70);

        if ($('.card').length > 1) {
            $('.swiper-pagination').show(0);
        }
        $ionicLoading.hide();
    }
    setTimeout($scope.resize, 2000);

    $scope.takePhoto = function() {
        $rootScope.trackEvent('Toque', 'Abrir', 'Camera', 0);
        $ionicLoading.show({
            template: 'Aguarde...'
        });
        $rootScope.photos = [];
        if (window.location.hostname == 'localhost') {
            // $rootScope.photos.push(PHOTO_BASE64);
            $rootScope.photos.push({
                location: {lat: null, lon: null},
                hash: PHOTO_BASE64
            });
            $ionicLoading.hide();
            storage.set('selectedSchool', $scope.school);
            $state.go("photos");
        } else {
            navigator.camera.getPicture(function(data) {

                $ionicLoading.show({
                    template: 'Aguarde...'
                });

                var photoHash = data;

                navigator.geolocation.getCurrentPosition(function(position) {
                    $rootScope.photos.push({
                        location: {lat: position.coords.latitude, lon: position.coords.longitude},
                        hash: photoHash
                    });
                    $ionicLoading.hide();
                    storage.set('selectedSchool', $scope.school);
                    $state.go("photos");
                }, function(error) {
                    console.log(error);
                    $rootScope.photos.push({
                        location: {lat: null, lon: null},
                        hash: photoHash
                    });
                    $ionicLoading.hide();
                    storage.set('selectedSchool', $scope.school);
                    $state.go("photos");
                }, {
                    timeout: 20000,
                    enableHighAccuracy: true,
                    maximumAge: 10000
                });

                // $ionicLoading.hide();
                // $rootScope.photos.push(data);
                // storage.set('selectedSchool', $scope.school);
                // $state.go("photos");
            }, function(data) {
                $ionicLoading.hide();
                // $ionicPopup.alert({
                //     title: 'Ops!',
                //     template: 'Ocorreu um erro ao tirar a foto. Tente novamente.'
                // });
            }, {
                quality: 50,
                // allowEdit: true,
                targetWidth: 1024,
                targetHeight: 1024,
                correctOrientation: true,
                destinationType: Camera.DestinationType.DATA_URL
            });
        }
    }

    $scope.replyModal = null;
    $scope.closeReplyModal = function() {
        $scope.replyModal.hide();
    }

    $rootScope.replyData = {};

    $scope.openMaps = function(lat, lon) {
        if (ionic.Platform.isAndroid()) {
            window.open("http://maps.google.com/maps?daddr=" + lat + "," + lon, '_system', 'location=yes')
        } else {
            window.open("http://maps.apple.com/?ll=" + lat + "," + lon, '_system', 'location=yes')
        }
    }

    $('body').on('click', '.card', function(event) {

        if ($(event.target).hasClass('ion-android-share')) {
            return false;
        }

        if ($(this).hasClass('showDetailReply') || $(this).hasClass('showDetailInspection')) {
            var slug = 'reply';
            if ($(this).hasClass('showDetailInspection')) {
                slug = 'inspection';
            }
            $state.go('cards', { id: id, slug: slug });
        } else {
            $rootScope.replyData.title = $(this).data('title');
            $rootScope.replyData.text = $(this).data('text');
            $rootScope.replyData.date = $(this).data('date');
            if ($(this).hasClass('reply') && $rootScope.replyData.text.length > 130) {
                $ionicModal.fromTemplateUrl('replydetail.html', {
                        scope: $scope,
                        animation: 'slide-in-up'
                    })
                    .then(function(modal) {
                        $scope.replyModal = modal;
                        $scope.replyModal.show();
                    });
            }
        }

    });

    /**
     * Custom back button
     */

    var doCustomBack = function() {
        $state.go('schools');
    };
    var deregisterHardBack = $ionicPlatform.registerBackButtonAction(
        doCustomBack, 101
    );
    $rootScope.$ionicGoBack = function() {
        doCustomBack();
    };

});

tdp.controller("CardsController", function($scope, $rootScope, $state, $stateParams, $ionicLoading, $ionicModal) {
    $scope.slug = $stateParams.slug;
    $scope.id = $stateParams.id;

    $scope.school = {};

    // $ionicLoading.show({
    //     template: 'Aguarde...'
    // });
    $rootScope.parseSchools($scope.id)
        .then(function(schools) {
            schools.forEach(function(school) {
                if (school.id == $scope.id) {
                    $rootScope.trackView('Ver mais cards: ' + school.name);
                    setTimeout(function() {
                        $scope.$apply(function() {
                            $scope.school = school;
                        });
                    }, 100);
                }
            });
            $ionicLoading.hide();
        });

    $scope.replyModal = null;
    $scope.closeReplyModal = function() {
        $scope.replyModal.hide();
    }

    $rootScope.replyData = {};

    $('body').on('click', '.card', function(event) {

        if ($(event.target).hasClass('ion-android-share')) {
            return false;
        }

        $rootScope.replyData.title = $(this).data('title');
        $rootScope.replyData.text = $(this).data('text');
        $rootScope.replyData.date = $(this).data('date');
        if ($(this).hasClass('reply') && $rootScope.replyData.text.length > 130) {
            $ionicModal.fromTemplateUrl('replydetail.html', {
                    scope: $scope,
                    animation: 'slide-in-up'
                })
                .then(function(modal) {
                    $scope.replyModal = modal;
                    $scope.replyModal.show();
                });
        }

    });

});

tdp.controller("PhotosController", function($scope, $rootScope, $state, $stateParams, $ionicHistory, $ionicPopup, $ionicLoading, $ionicPlatform) {

    $rootScope.trackView('Enviar vistoria');

    $scope.inspection = {};

    if (window.location.hostname == 'localhost') {
        if (!$rootScope.photos) {
            $rootScope.photos = [];
            $rootScope.photos.push(PHOTO_BASE64);
        }
    }

    $scope.takePhoto = function() {
        $rootScope.trackEvent('Toque', 'Abrir', 'Camera', 0);
        $ionicLoading.show({
            template: 'Aguarde...'
        });
        if (window.location.hostname == 'localhost') {
            if (!$rootScope.photos) {
                $rootScope.photos = [];
            }
            $rootScope.photos.push({
                location: {lat: null, lon: null},
                hash: PHOTO_BASE64
            });
            $ionicLoading.hide();
        } else {
            navigator.camera.getPicture(function(data) {

                $ionicLoading.show({
                    template: 'Aguarde...'
                });

                var photoHash = data;
                navigator.geolocation.getCurrentPosition(function(position) {
                    $rootScope.photos.unshift({
                        location: {lat: position.coords.latitude, lon: position.coords.longitude},
                        hash: photoHash
                    });
                    $ionicLoading.hide();
                }, function(error) {
                    console.log(error);
                    $rootScope.photos.unshift({
                        location: {lat: null, lon: null},
                        hash: photoHash
                    });
                    $ionicLoading.hide();
                    // scrollPhotosToTheEnd();
                    // $scope.takeAnotherPhoto();
                }, {
                    timeout: 20000,
                    enableHighAccuracy: true,
                    maximumAge: 10000
                });
            }, function(data) {
                $ionicLoading.hide();
                // $ionicPopup.alert({
                //     title: 'Ops!',
                //     template: 'Ocorreu um erro ao tirar a foto. Tente novamente.'
                // });
            }, {
                quality: 50,
                // allowEdit: true,
                targetWidth: 1024,
                targetHeight: 1024,
                correctOrientation: true,
                destinationType: Camera.DestinationType.DATA_URL
            });
        }
        return false;
    }

    $scope.viewPhoto = function(index) {
        PhotoViewer.show('data:image/png;base64,' + $scope.photos[index].hash, '', {share: true});
    }

    $scope.inspection_id = 0;
    $scope.savedPhoto = '';

    $scope.sendPhotos = function() {
        $rootScope.trackEvent('Toque', 'Salvar', 'Fotos', 0);
        $ionicLoading.show({
            template: 'Aguarde...'
        });

        var photos = $rootScope.photos.map(function(photo) {
            photo.hash = 'data:image/png;base64,' + photo.hash;
            return photo;
        });

        var formattedDate = moment().format('DD/MM/YY');

        var id = Math.random() * 9999999 + 1;
        DB.tmp_inspections.put({
            id: id,
            text: 'Seu alerta de ' + formattedDate + ' foi enviado para nossos engenheiros. Se eles encontrarem sinais de atraso, falaremos com o governo.',
            photos: photos,
            school_id: parseInt(storage.get('current_school')),
            delayed: true,
            inspection_id: '',
            comment: $scope.inspection.comment
        });
        if ($rootScope.onLine) {
            DB.inspection_status.put({
                id: id + 1,
                instance: 'Alerta',
                status: 2,
                inspection_id: id,
                time: new Date().getTime()
            });
            DB.inspection_status.put({
                id: id + 2,
                instance: 'Avaliação',
                status: 1,
                inspection_id: id,
                time: new Date().getTime()
            });
        } else {
            DB.inspection_status.put({
                id: id + 1,
                instance: 'Alerta',
                status: 1,
                inspection_id: id,
                time: new Date().getTime()
            });
            DB.inspection_status.put({
                id: id + 2,
                instance: 'Avaliação',
                status: 0,
                inspection_id: id,
                time: new Date().getTime()
            });
        }

        $rootScope.photos = [];
        storage.deleteKey('current_school');
        $ionicLoading.hide();

        if (!$rootScope.onLine) {
            cordova.plugins.notification.local.hasPermission(function (granted) {

                var now = new Date().getTime(),
                        _1_hou_from_now = new Date(now + (60 * 1000 * 60 * 1));

                cordova.plugins.notification.local.schedule({
                    id: id,
                    title: "Você possui evidências para serem enviadas!",
                    text: "Clique nessa notificação para enviá-las.",
                    trigger: { at: _1_hou_from_now },
                    priority: 1
                });
            });
        }

        $state.go('sent');

        $('.selectAnswer').each(function() {
            $(this).prop('checked', false);
        });
    };

    $('body').on('click', '.selectAnswer', function() {
        var option = storage.get('checkedOption');
        if ($(this).data('index') > option) {
            storage.set('checkedOption', $(this).data('index'));
        }
        if ($(this).prop('checked')) {
            $rootScope.trackEvent('Toque', 'Marcar', 'Item Obra', 0);
            $(this).parent().addClass('yellow');
        } else {
            $rootScope.trackEvent('Toque', 'Desmarcar', 'Item Obra', 0);
            $(this).parent().removeClass('yellow');
        }
    });

    /**
     * Custom back button
     */

    var doCustomBack = function() {
        $ionicHistory.goBack();
    };
    var deregisterHardBack = $ionicPlatform.registerBackButtonAction(
        doCustomBack, 101
    );
});

tdp.controller("SentController", function($scope, $rootScope, $state, $stateParams, $ionicHistory, $ionicPopup, $filter, $ionicLoading, $ionicPlatform) {

    $scope.isSendindInspections = $rootScope.isSendingInspections;

    $rootScope.sendInspections(true);
    $rootScope.trackView('Vistoria enviada');

    $scope.school = storage.get('selectedSchool');
    $scope.answer = $rootScope.checks[storage.get('checkedOption')];

    var date = new Date($scope.school.deadline);
    $scope.late = 0;

    if (date) {
        $scope.school.deadline = date;
        var now = new Date();
        if (date < now) {
            $scope.late = Math.ceil(Math.abs(now.getTime() - date.getTime()) / (1000 * 3600 * 24));
        }
    }

    var schoolType = ($scope.school.type == 'kindergarten' ? 'creche' : 'escola')

    // this is a very importante rule, if late is > 0, means the school will show a late message and
    // a shareable message for the user, else, all is good
    if ($scope.late > 0) {
        var day = ("0" + date.getDate()).slice(-2);
        var month = ("0" + (date.getMonth() + 1)).slice(-2);
        $scope.text = 'Essa escola já deveria ter sido inaugurada. O prazo de entrega foi ' + day + '/' + month + '/' + date.getFullYear() + '. #FiqueNoPé e traga mais gente!';
        $scope.share_text = 'A construção da ' + schoolType + ' ' + $scope.school.name + ' está há ' + $filter('daysToVerbose')($scope.late) + ' atrasada. Eu estou no pé da Prefeitura de ' + $scope.school.city + ', e você?';
        $scope.color = 'red';
    } else {
        var percent = $scope.answer ? $scope.answer.percent : 0;
        if ($scope.school.progress < percent) {
            $scope.text = $scope.answer.not_late;
            $scope.share_text = 'Eu estou no pé da Prefeitura de ' + $scope.school.city + ' para a entrega da ' + schoolType + ' ' + $scope.school.name + '. #FiqueNoPé você também';
            $scope.color = '';
        } else {
            $scope.text = $scope.answer ? $scope.answer.late : 'A obra deveria ter começado. Sem tapumes, ela esta  atrasada.';
            $scope.share_text = 'A construção da ' + schoolType + ' ' + $scope.school.name + ' está há ' + $filter('daysToVerbose')($scope.late) + ' atrasada. Eu estou no pé da Prefeitura de ' + $scope.school.city + ', e você?';
            $scope.color = 'red';
        }
        $scope.icon = $scope.answer ? $scope.answer.icon : 'icon-fance';
    }

    $scope.onLine = navigator.onLine;

    // customize the alert on the sent screen, using internet connection as a parameter
    if ($scope.onLine) {
        $scope.i = {
            status: [{
                id: 1,
                instance: "Alerta",
                status: 2,
                inspection_id: 1
            }, {
                id: 1,
                instance: "Avaliação",
                status: 1,
                inspection_id: 1
            }, {
                id: 1,
                instance: "Prefeitura",
                status: 0,
                inspection_id: 1
            }]
        };
    } else {
        $scope.i = {
            status: [{
                id: 1,
                instance: "Alerta",
                status: 1,
                inspection_id: 1
            }, {
                id: 1,
                instance: "Avaliação",
                status: 0,
                inspection_id: 1
            }, {
                id: 1,
                instance: "Prefeitura",
                status: 0,
                inspection_id: 1
            }]
        };
    }

    var cancelBack = function() {
        console.log("BACK CANCELLED");
    };
    var deregisterHardBack = $ionicPlatform.registerBackButtonAction(
        cancelBack, 101
    );

});

// basic filters for the application
tdp.filter('formatDate', function() {
    return function(date) {
        var months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
        date = new Date(date);
        var day = date.getDate() > 9 ? date.getDate() : '0' + date.getDate();
        var month = date.getMonth() > 9 ? date.getMonth() : '0' + (date.getMonth() + 1);
        return months[date.getMonth()] + '/' + date.getFullYear();
    };
});

tdp.filter('formatDateOnlyTwo', function() {
    return function(date) {
        var months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
        date = new Date(date);
        var day = date.getDate() > 9 ? date.getDate() : '0' + date.getDate();
        var month = date.getMonth() > 9 ? date.getMonth() : '0' + (date.getMonth() + 1);
        year = (date.getFullYear() + "").substring(2, 4);
        value = (months[date.getMonth()] + '/' + year);
        return value;
    };
});

tdp.filter('daysToMonth', function() {
    return function(days) {
        if (days <= 30) {
            return '1 MÊS';
        }
        return parseInt(Math.ceil(days / 30)) + ' MESES';
    };
});

tdp.filter('deadline', function() {
    return function(date) {
        date = new Date(date);
        var months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
        var day = date.getDate() > 9 ? date.getDate() : '0' + date.getDate();
        var month = date.getMonth() > 9 ? date.getMonth() : '0' + date.getMonth();
        return months[date.getMonth()] + '/' + date.getFullYear();
    };
});

tdp.filter('toEnd', function() {
    return function(date) {
        date = new Date(date);
        var days = Math.round((date - new Date()) / (1000 * 60 * 60 * 24));;
        if (days <= 30) {
            return '1 MÊS';
        }
        return parseInt(Math.ceil(days / 30)) + ' MESES';
    };
});

tdp.filter('daysToVerbose', function() {
    return function(days) {
        if (days < 1) {
            return '';
        }
        if (days == 1) {
            return '1 dia';
        }
        if (days <= 30) {
            return days + ' dias';
        }
        months = parseInt(Math.ceil(days / 30))
        if (months == 1) {
            return '1 mês';
        }
        if (months <= 11) {
            return months + ' meses';
        }
        years = parseInt(Math.ceil(months / 12))
        if (years == 1) {
            return '1 ano';
        }
        if (years > 1) {
            return years + ' anos';
        }
    };
});
