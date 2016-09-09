#!/usr/bin/env node

const  babelify         =  require("babelify");
const  babelify_preset  =  require('babel-preset-es2015');
const  browserify       =  require('browserify');
const  fs               =  require('fs-extra');
const  nsg              =  require('node-sprite-generator');
const  path             =  require('path');
const  program          =  require('commander');
const  spawnSync        =  require('child_process').spawnSync;
const  stylus           =  require('stylus');

program
  .option('-d --done [script]', "The path to a script to run after build")
  .option('-s --styles [path]', "Directory of additional style imports relative to the src directory")
  .parse(process.argv);

var  afterScript    =  program.done;
var  styleIncludes  =  program.styles;
var  cache_path     =  'build_cache';

console.log("Starting Build")

fs.removeSync(cache_path, true);
fs.removeSync('build', true);

fs.mkdirSync('build');
fs.mkdirSync(path.join('build', 'js'));
fs.mkdirSync(path.join('build', 'css'));
fs.copySync('src', cache_path);

var  index_path  =  path.join(cache_path, 'index.html');
var  index       =  fs.readFileSync(index_path, 'utf8');

var include_regex = /<(\w+\b(?:.|\n)+?)data-include="'(.+?)'"(.*?)>/;
var match;

while ((match = include_regex.exec(index)) !== null) {

  var  to_replace   =  match[0];
  var  tag_opening  =  match[1];
  var  file_name    =  match[2];
  var  tag_closing  =  match[3];

  var  replacement  =  "<" + tag_opening + tag_closing + ">" + fs.readFileSync(path.join(cache_path, file_name), 'utf8');

  index = index.replace(to_replace, replacement);
}

fs.writeFileSync(path.join('build', 'index.html'), index);

var asyncLock = 0;

function afterScriptCaller() {
  if (!afterScript) {
    return
  }
  asyncLock++;
  if (asyncLock == 2) {
    console.log("Running after build script")
    afterScriptResult = spawnSync(afterScript, [], {
      stdio: [0, 1, 2],
      cwd: process.cwd()
    });
    if (afterScriptResult.error) {
      console.log("An error occurred running the after script, make sure it is executable");
      console.error(afterScriptResult.error);
    }
    console.log("Finished after build script");
  }
}

browserify({debug: true})
  .transform(babelify, {presets: ["es2015"]})
  .require(path.join(cache_path, 'app.js'), { entry: true })
  .bundle()
  .on("error", function (err) { console.log("Error: " + err.message); })
  .pipe(fs.createWriteStream(path.join('build', 'js', 'app.js')))
  .on("close", function(){
    afterScriptCaller();
  });

//Generate sprite styles
var  sprite_css_path  =  path.join(cache_path, 'styles', 'sprite.css');
var  total_css        =  "";

function stylus_callback(err, css) {
  if (err) {
    console.log(err);
  } else {
    total_css += css;
  }
}

fs.copySync(path.join('src', 'images'), path.join('build', 'images'));

var sprite_src = path.join('src', 'images', 'sprites');

nsg({
  src: [
    path.join(sprite_src, '*.png')
  ],
  spritePath: path.join('build', 'images', 'sprite.png'),
  stylesheetPath: sprite_css_path,
  stylesheet: 'css',
  stylesheetOptions: {
    prefix: 'icon-',
    pixelRatio: 2,
    spritePath: '../images/sprite.png'
  }
}, function(err) {
  if (err) {
    if (fs.readdirSync(sprite_src).length > 0)
    {
      console.log("Error Generating Sprites", err);
    }
  }
  else
  {
    console.log("Sprite Generated");
  }
  var  styles   =  fs.readdirSync(path.join(cache_path, 'styles')).filter(function(name) {
    return name[0] !== '.' && name !== 'base.styl' && name !== 'fonts.styl';
  });


  var styl_path, styl_content;

  for (var len = styles.length, i = 0; i < len; ++i) {
    styl_path = path.join(cache_path, 'styles', styles[i]);
    styl_content = fs.readFileSync(styl_path, 'utf8');
    var s = stylus(styl_content)
              .set('filename', styles[i])
              .include(require('nib').path)
              .include(path.join(cache_path, 'styles'))

    if (styleIncludes && styleIncludes.length > 0) {
      s = s.include(path.join(cache_path, styleIncludes));
    }

    s.render(stylus_callback);
  }

  total_css += fs.readFileSync(sprite_css_path, 'utf8');

  fs.writeFileSync(path.join('build', 'css', 'styles.css'), total_css);
  console.log("Built Style sheet");

  var font_dir_path = path.join(cache_path, 'fonts');
  if (fs.statSync(font_dir_path).isDirectory())
  {
    fs.copySync(font_dir_path, path.join('build', 'css', 'fonts'));
  }

  fs.copySync(path.join('bower_components'), path.join('build', 'bower_components'));
  afterScriptCaller();
});

