define(function(require, exports, module) {
    var session = require("zed/session");

    var parse = require("./lua_parse.js").parse;

    return function(data, callback) {
        var path = data.path;
        session.getText(path, function(err, text) {
            try {
                parse(text);
            } catch (e) {
                var message = e.message.split(" ").slice(1).join(" ");
                return session.setAnnotations(path, [{
                    row: e.line-1,
                    text: message,
                    type: "error"
                }], callback);
            }
            session.setAnnotations(path, [], callback);
        });
    };
});