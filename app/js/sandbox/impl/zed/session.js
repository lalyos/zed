define(function(require, exports, module) {
    var session_manager = require("../../../session_manager");
    var Range = ace.require("ace/range").Range;

    function rangify(range) {
        return Range.fromPoints(range.start, range.end);
    }

    function getSession(path) {
        var session = session_manager.getSessions()[path];
        return session;
    }

    return {
        setAnnotations: function(path, annos, callback) {
            getSession(path).setAnnotations(annos);
            callback();
        },
        getText: function(path, callback) {
            callback(null, getSession(path).getValue());
        },
        setText: function(path, text, callback) {
            var session = getSession(path);

            // Save scroll/cursor state
            var scrollTop = session.getScrollTop();
            var scrollLeft  = session.getScrollLeft();
            var cursorPos = session.selection.getCursor();

            var range = session.getSelection().getRange();
            range.start.row = 0;
            range.start.column = 0;
            range.end.row = session.getLength();
            var line = session.getLine(range.end.row);
            range.end.column = line.length;

            session.replace(range, text);

            session.selection.clearSelection();
            session.selection.moveCursorToPosition(cursorPos);
            session.setScrollTop(scrollTop);
            session.setScrollLeft(scrollLeft);
            callback();
        },
        getAllLines: function(path, callback) {
            callback(null, getSession(path).getDocument().getAllLines());
        },
        getSelectionRange: function(path, callback) {
            var range = getSession(path).selection.getRange();
            callback(null, {start: range.start, end: range.end});
        },
        getSelectionText: function(path, callback) {
            var session = getSession(path);
            var range = session.selection.getRange();
            callback(null, session.getTextRange(range));
        },
        getTextRange: function(path, range, callback) {
            callback(null, getSession(path).getTextRange(rangify(range)));
        },
        getCursorPosition: function(path, callback) {
            callback(null, getSession(path).selection.getCursor());
        },
        setCursorPosition: function(path, pos, callback) {
            var session = getSession(path);
            session.selection.clearSelection();
            session.selection.moveCursorToPosition(pos);
            callback();
        },
        getScrollPosition: function(path, callback) {
            var session = getSession(path);
            callback(null, {
                scrollTop: session.getScrollTop(),
                scrollLeft: session.getScrollLeft()
            });
        },
        setScrollPosition: function(path, pos, callback) {
            var session = getSession(path);
            session.setScrollTop(pos.scrollTop);
            session.setScrollLeft(pos.scrollLeft);
            callback();
        },
        replaceRange: function(path, range, text, callback) {
            var session = getSession(path);
            var cursorPos = session.selection.getCursor();

            session.replace(rangify(range), text);

            session.selection.clearSelection();
            session.selection.moveCursorToPosition(cursorPos);
            callback();
        }
    };
});