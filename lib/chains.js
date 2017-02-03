var _ = fis.util;

function prevCallbacks(fn, error, value) {
  while (fn) {
    // 实际上__callback是上一个函数的回调
    fn.__callback && (fn.__callback(error, value), value = fn.__ret);
    fn = fn.__prev;
  }
}

module.exports = function() {
  var chains = [];

  return {
    use: function(fn) {
      chains.push(fn);
      return this;
    },

    run: function(value) {
      // 数组执行顺序从右往左
      var fn = _.reduceRight(chains, function(next, current) {
        // 最后一个被调用的函数没有__raw
        (next.__raw || next).__prev = current;

        var wrapped = function(error, value, callback) {
          if (arguments.length === 2 && typeof value === 'function') {
            callback = value;
            value = null;
          }
          // value是上一个函数的返回值
          current.__ret = value;
          // callback是上一个函数执行完后，调用next时传递的回调
          current.__callback = callback;
          // 如果上一步出现错误，则直接处理已注册的所有回调（通知上一步函数的callback处理，并且依次向前传递）
          // 如果没有出现错误，则执行当前函数
          error ? prevCallbacks(current, error, value) : current(value, next);
        };

        wrapped.__raw = current;
        return wrapped;
        // 当处于chains末尾的函数出现error时，也应处理
        // 最后一个被调用的函数
      }, function(error, ret, callback) {
        // fn是上一个函数
        var fn = arguments.callee;
        // 处理所有回调
        callback && callback(error, ret);
        prevCallbacks(fn, error, ret);
      // 起始参数列表
      })(null, value);
    }
  };
};
