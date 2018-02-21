var gulp = require('gulp');
var gutil = require('gulp-util');
var bower = require('bower');
var concat = require('gulp-concat');
var sass = require('gulp-sass');
var minifyCss = require('gulp-minify-css');
var rename = require('gulp-rename');
var sh = require('shelljs');

var paths = {
  sass: ['./scss/**/*.scss']
};

gulp.task('default', ['sass']);

gulp.task('build-android', ['scripts'], function () {
    sh.exec('cordova build android')
});

gulp.task('run-android', ['scripts'], function () {
    sh.exec('cordova run android')
});

gulp.task('build-ios', ['scripts'], function () {
    sh.exec('cordova build ios')
});

gulp.task('sass', function(done) {
  gulp.src('./scss/ionic.app.scss')
    .pipe(sass())
    .on('error', sass.logError)
    .pipe(gulp.dest('./www/css/'))
    .pipe(minifyCss({
      keepSpecialComments: 0
    }))
    .pipe(rename({ extname: '.min.css' }))
    .pipe(gulp.dest('./www/css/'))
    .on('end', done);
});

gulp.task('watch', ['sass'], function() {
  gulp.watch(paths.sass, ['sass']);
});

gulp.task('install', ['git-check'], function() {
  return bower.commands.install()
    .on('log', function(data) {
      gutil.log('bower', gutil.colors.cyan(data.id), data.message);
    });
});

gulp.task('git-check', function(done) {
  if (!sh.which('git')) {
    console.log(
      '  ' + gutil.colors.red('Git is not installed.'),
      '\n  Git, the version control system, is required to download Ionic.',
      '\n  Download git here:', gutil.colors.cyan('http://git-scm.com/downloads') + '.',
      '\n  Once git is installed, run \'' + gutil.colors.cyan('gulp install') + '\' again.'
    );
    process.exit(1);
  }
  done();
});

gulp.task('scripts', function() {
  return gulp.src([
    './bower_components/ionic/js/ionic.bundle.js',
    './bower_components/ngCordova/dist/ng-cordova.min.js',
    './bower_components/moment/moment.js',
    './bower_components/moment/locale/pt-br.js',
    './bower_components/angular-moment/angular-moment.js',
    './bower_components/ngstorage/ngStorage.min.js',
    './bower_components/angular-svg-round-progressbar/build/roundProgress.min.js',
    './bower_components/ionic-cache-src/ionic-cache-src.js',
    './www/js/lib/sharing.js',
    './bower_components/jquery/dist/jquery.min.js',
    './bower_components/axios/dist/axios.min.js',
    './bower_components/dexie/dist/dexie.min.js',
    './bower_components/jStorage/jstorage.min.js',
    './www/js/lib/funcs.js',
    './bower_components/raven-js/dist/raven.js',
    './bower_components/raven-js/dist/plugins/angular.js',
    './www/js/app.js',
  ])
  .pipe(concat('all.js'))
  .pipe(gulp.dest('./www/js'));
});
