var time = require('./time.js');
var stream = process.stdout;
var _ = fis.util;
var lastModified = {};

process.on('exit', function() {
  console.log();
});

function duration(ms) {
  return ms > 999 ? ((ms / 1000).toFixed(2) + 's') : (ms + 'ms');
}

function release(options, next) {

  stream.write('\n Ω '.green.bold);
  var verbose = options.verbose;

  var alertDurtion = 1000; // 1s
  var alertCacheDurtion = 200; // 200ms

  var total = options.total || {};
  var modified = {};

  // 每个文件编译前执行，无论是否采用缓存
  options.beforeEach = function(file) {
    if (file.isPartial)return;
    file._start = Date.now(); // 记录起点
    // inline的文件release的值也是false
    // total是所有应release的文件
    file.release !== false && (total[file.subpath] = file);
    // 默认认为文件是没有编译，直接使用缓存的
    file._fromCache = true;
  };

  // 每个文件编译前执行，当采用缓存时不执行
  options.beforeCompile = function(file) {
    if (file.isPartial)return;
    // 进入这里的file认为文件是经过编译的
    file._fromCache = false;
    // inline的文件release的值也是false
    // modified是所有应release且经过编译的文件
    file.release !== false && (modified[file.subpath] = file);
  };

  // 每个文件编译后执行，无论是否采用缓存
  options.afterEach = function(file) {
    if (file.isPartial)return;
    var mtime = file.getMtime().getTime();
    var fromCache = file._fromCache;

    // 第一次release时，即使文件的编译结果来自缓存也应output，这里用lastModifed控制下
    // 第一次release时，所有应release的文件对应的lastModifed的值为undefined
    if (file.release && (!fromCache || lastModified[file.subpath] !== mtime)) {
      var cost = Date.now() - file._start;
      // 如果采用缓存
      //   如果超出alertCacheDurtion，用黄色的'.'
      //   如果没有超出alertCacheDurtion，用灰色的'.'
      // 如果没有采用缓存
      //   如果超出alertDurtion，用黄色的'.'
      //   如果没有超出alertDurtion，用普通的'.'
      var flag = fromCache ? (cost > alertCacheDurtion ? '.'.bold.yellow : '.'.grey) : (cost > alertDurtion ? '.'.bold.yellow : '.');

      lastModified[file.subpath] = mtime;
      modified[file.subpath] = file;

      verbose ? fis.log.debug(file.realpath) : stream.write(flag);
    }
  };

  try {
    // 记录编译开始时间
    var start = Date.now();
    fis.log.throw = true;

    // release
    fis.release(options, function(ret) {
      // 编译完毕后本函数被调用

      // 打印release总体消耗时间
      stream.write(fis.log.format('%s%s'.bold.green, verbose ? '' : ' ', duration(Date.now() - start)));

      // clear cache
      options.unique && time(fis.compile.clean);

      var totalBeforePack = _.assign({}, total);
      _.map(ret.pkg, function(subpath, file) {
        modified[subpath] = file;
        total[subpath] = file;
      });

      next(null, {
        options: options,
        modified: modified,
        total: total,
        totalBeforePack: totalBeforePack
      });
    });
  } catch (e) {
    fis.emit('release:error', e);
    process.stdout.write('\n [ERROR] ' + (e.message || e) + '\n');
    fis.log.debug(e.stack);
    if (options.watch) {
      // alert
      process.stdout.write('\u0007');
    } else if (options.verbose) {
      throw e;
    } else {
      process.exit(1);
    }

    next(e);
  }
}

module.exports = release;
