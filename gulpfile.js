var gulp = require('gulp');
var plugins = require('gulp-load-plugins')();
var runSequence = require('run-sequence');
var del = require('del');
var assign = require('lodash/assign');
var browserify = require('browserify');
var watchify = require('watchify');
var babelify = require('babelify');
var hbsfy = require('hbsfy');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var mergeStream = require('merge-stream');
var through = require('through2');
const { series, parallel } = require('gulp');
const server = require( 'gulp-develop-server' );
var sass = require('gulp-dart-sass');
//sass.compiler = require('sass');

var args = process.argv.slice(3);

gulp.task('clean', async function (done) {
  return del(['build'], done);
});

gulp.task('copy', async function () {
  return mergeStream(
    gulp.src('public/imgs/**/*').pipe(gulp.dest('build/public/imgs/')),
    gulp.src('public/avatars/**/*').pipe(gulp.dest('build/public/avatars/')),
    gulp.src('server/*.txt').pipe(gulp.dest('build/server/')),
    gulp.src('public/*.json').pipe(gulp.dest('build/public/'))
  );
});

gulp.task('css', async function () {
  return gulp.src('public/scss/*.scss')
    .on('error', plugins.util.log.bind(plugins.util))
    .pipe(sass.sync().on('error', sass.logError))
    .pipe(plugins.sourcemaps.init())
    .pipe(sass({ outputStyle: 'compressed' }))
    .pipe(plugins.sourcemaps.write('./'))
    .pipe(gulp.dest('build/public/css/'));
});

function createBundle(src) {
  if (!src.push) {
    src = [src];
  }

  var customOpts = {
    entries: src,
    debug: true
  };
  var opts = assign({}, watchify.args, customOpts);
  var b = watchify(browserify(opts));

  b.transform(babelify.configure({
    presets: ["@babel/preset-env"]
  }));

  b.transform(hbsfy);
  b.on('log', plugins.util.log);
  return b;
}

function bundle(b, outputPath) {
  var splitPath = outputPath.split('/');
  var outputFile = splitPath[splitPath.length - 1];
  var outputDir = splitPath.slice(0, -1).join('/');

  return b.bundle()
    // log errors if they happen
    .on('error', plugins.util.log.bind(plugins.util, 'Browserify Error'))
    .pipe(source(outputFile))
    // optional, remove if you don't need to buffer file contents
    .pipe(buffer())
    // optional, remove if you dont want sourcemaps
    .pipe(plugins.sourcemaps.init({loadMaps: true})) // loads map from browserify file
       // Add transformation tasks to the pipeline here.
    .pipe(plugins.sourcemaps.write('./')) // writes .map file
    .pipe(gulp.dest('build/public/' + outputDir));
}

var jsBundles = {
  'js/polyfills/promise.js': createBundle('./public/js/polyfills/promise.js'),
  'js/polyfills/url.js': createBundle('./public/js/polyfills/url.js'),
  'js/settings.js': createBundle('./public/js/settings/index.js'),
  'js/main.js': createBundle('./public/js/main/index.js'),
  'js/remote-executor.js': createBundle('./public/js/remote-executor/index.js'),
  'js/idb-test.js': createBundle('./public/js/idb-test/index.js'),
  'sw.js': createBundle(['./public/js/sw/index.js', './public/js/sw/preroll/index.js'])
};

gulp.task('js:browser', async function () {
  return mergeStream.apply(null,
    Object.keys(jsBundles).map(function(key) {
      return bundle(jsBundles[key], key);
    })
  );
});

gulp.task('js:server', function () {
  return gulp.src('server/**/*.js')
    .pipe(plugins.sourcemaps.init())
    .pipe(plugins.babel({presets: ["@babel/preset-env"]}))
    .on('error', plugins.util.log.bind(plugins.util))
    .pipe(plugins.sourcemaps.write('.'))
    .pipe(gulp.dest('build/server'));
});

gulp.task('templates:server', function () {
  return gulp.src('templates/*.hbs')
    .pipe(plugins.handlebars())
    .on('error', plugins.util.log.bind(plugins.util))
    .pipe(through.obj(function(file, enc, callback) {
      // Don't want the whole lib
      file.defineModuleOptions.require = {Handlebars: 'handlebars/runtime'};
      callback(null, file);
    }))
    .pipe(plugins.defineModule('commonjs'))
    .pipe(plugins.rename(function(path) {
      path.extname = '.js';
    }))
    .pipe(gulp.dest('build/server/templates'));
});

gulp.task('watch', function (done) {
  console.log('watch');
  gulp.watch(['public/scss/**/*.scss'], gulp.series('css'));
  gulp.watch(['templates/*.hbs'], gulp.series('templates:server'));
  gulp.watch(['server/**/*.js'], gulp.series('js:server'));
  gulp.watch(['public/imgs/**/*', 'public/avatars/**/*', 'server/*.txt', 'public/*.json'], 
    gulp.series('copy'));

  Object.keys(jsBundles).forEach(function(key) {
    var b = jsBundles[key];
    b.on('update', function() {
      return bundle(b, key);
    });
  });

  done();
});

gulp.task('server', function(done) {
  console.log('server');
  server.listen({
    path: './index.js',
    cwd: './build/server',
    args: args
  });

  gulp.watch([
    'build/server/**/*.js'
  ], server.restart);

  done();
});

gulp.task('serve', series('clean', 
  series('css', 'js:browser', 'templates:server', 'js:server', 'copy'), 
  series('server', 'watch'))
);
