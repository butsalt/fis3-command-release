var _ = fis.util;
var makeChains = require('./chains.js');

function filter(hash, item) {

  // 快速查找
  if (typeof item.raw === 'string' && hash[item.raw]) {
    // raw和某个file的subpath完全匹配
    // 如果file的release为真则将这个file放入一个空数组并返回
    // 否则返回空数组
    return hash[item.raw].release !== false ? [hash[item.raw]] : [];
  }

  var reg = item.reg;

  return _.toArray(hash).filter(function(file) {
    // 重置正则表达式
    reg.lastIndex = 0;
    return (reg === '**' || reg.test(file.subpath)) !== item.negate && file.release !== false;
  });
}

function callPlugin(dest, info/*, args...*/) {
  var args = [].slice.call(arguments, 2);
  var plugin = info;

  if (typeof plugin !== 'function') {
    var pluginName = plugin.__name || plugin;
    // 获取deploy下名为pluginName的processor
    plugin = fis.require('deploy-' + pluginName);
  }

  if (typeof plugin !== 'function') {
    throw new Error('The plugin is not callable!');
  }

  var options = {};
  // 应用默认配置
  _.assign(options, plugin.defaultOpitons || plugin.options || {});
  // 应用当前配置
  _.isPlainObject(info) && _.assign(options, info);

  // 命令行指定位置。
  options.dest = dest;

  // processor方法的第一个参数是配置
  args.unshift(options);
  return plugin.apply(null, args);
}

function cloneFile(file) {
  var cloned = fis.file(file.realpath);
  cloned.revertFromCacheData(file.getCacheData());
  cloned.setContent(file.getContent());
  // cacheData不包含以一个'_'开始的私有属性
  if (file._md5) {
    // 复制私有的md5过来就不用重新计算了
    cloned._md5 = file._md5;
  }
  // 这三个属性是不可枚举的
  ['isHtmlLike', 'isJsLike', 'isCssLike'].forEach(function(key) {
    file[key] && (cloned[key] = true);
  });
  return cloned;
}

function cloneFileMap(map) {
  var coped = {};
  Object.keys(map).forEach(function(subpath) {
    coped[subpath] = cloneFile(map[subpath]);
  });
  return coped;
}

/**
 * Obj 说明
 *
 * - modified 修改过的文件
 * - total 所有文件
 * - options release 配置项
 */
module.exports = function(obj, callback) {
  var total = cloneFileMap(obj.total);
  var modified = cloneFileMap(obj.modified);
  var chains = makeChains();

  if (_.isEmpty(modified)) {
    return callback();
  }

  var matches = fis
    .media()
    .getSortedMatches()
    .filter(function(item) {
      return item.properties.deploy;
    });

  if (!matches.length) {
    // 没有定义deploy，那么所有需要输出的文件都输出到本地
    matches.push({
      reg: _.glob('**'),
      raw: '**',
      properties: {
        deploy: [
          // 将文件统一以utf-8编码的任务
          fis.plugin('encoding'),
          // 输出到本地的任务
          fis.plugin('local-deliver')
        ]
      }
    });
  }

  // 每个group就是一组task
  var groups = matches.map(function(item) {
    // 过滤出符合task列表执行要求的file列表
    var list = filter(modified, item);
    var all = filter(total, item);
    // 分配任务
    var tasks = item.properties.deploy;

    if (typeof tasks === 'string') {
      tasks = tasks.split(/\s*,\s*/);
    } else if (!Array.isArray(tasks)) {
      tasks = [tasks];
    }

    return {
      modified: list,
      total: all,
      tasks: tasks
    };
  });

  var assignedTotal = [];
  var assignedModified = [];
  // 循环方向是从最后一个到第一个
  // 避免同一个文件同时出现在多个group，导致输出多次
  _.eachRight(groups, function(group) {
    group.modified = _.difference(group.modified, assignedModified);
    group.total = _.difference(group.total, assignedTotal);

    assignedModified.push.apply(assignedModified, group.modified);
    assignedTotal.push.apply(assignedTotal, group.total);
  });

  fis.emit('deploy:start', groups);

  groups.forEach(function(group) {
    var list = group.modified;
    var all = group.total;
    var tasks = group.tasks;

    // 没有要处理的文件，就不要加到chains里去了
    if (!list.length && !all.length) {
      return;
    }

    // 注册到chains中，待执行
    chains.use(function(v, next) {
      var subchains = makeChains();

      tasks.forEach(function(plugin) {
        // 注册到子chains中，对每个file调用plugin
        subchains.use(function(v, next) {
          var ret = callPlugin(obj.options.dest, plugin, list, all, next);

          // 当有返回值时，表示不是异步，不需要等待。
          if (typeof ret !== 'undefined') {
            next(null, ret);
          }
        });
      });

      subchains.use(next);
      // 执行子chains
      subchains.run();
    });
  });


  chains.use(function(v, next) {
    fis.emit('deploy:end');
    next(null, v);
  });
  chains.use(callback);
  chains.run();
};
