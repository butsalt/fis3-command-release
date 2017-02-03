var _ = fis.util;

function prevCallbacks(fn, error, value) {
  while (fn) {
    // 实际上__callback是fn的上一个函数的回调函数
    // 传递给callback的value理应是下一个函数函数处理完后的返回值
    // 但如果当前函数的返回中包含异常，则立即处理所有回调，所以传递给这个函数的回调的value就是它处理完后的返回值
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
        // 最后一个被调用的函数
        // 这个函数就是为chains[chains.length - 1]封装的next函数
      }, function(error, ret, callback) {
        // fn === chains[chains.length - 1]
        var fn = arguments.callee;
        // 处理所有回调
        // 作为chains中的最后一个函数，传给它的value只能是该函数的返回值
        callback && callback(error, ret);
        prevCallbacks(fn, error, ret);
      // 起始参数列表
      })(null, value);
    }
  };
};
