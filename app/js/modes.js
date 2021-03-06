/*global define, _ */
define(function(require, exports, module) {
    "use strict";
    var eventbus = require("./lib/eventbus");
    var async = require("./lib/async");
    var settingsfs = require("./fs/settings");
    var command = require("./command");

    eventbus.declare("modesloaded");
    eventbus.declare("modeset");

    var modes = bareMinimumModes();
    var extensionMapping = {};

    function bareMinimumModes() {
        return {
            text: {
                language: "text",
                name: "Plain Text",
                highlighter: "ace/mode/text"
            }
        };
    }

    function superExtend(dest, source) {
        if(_.isArray(dest)) {
            return dest.concat(source);
        } else if(_.isObject(dest)) {
            for(var p in source) {
                if(source.hasOwnProperty(p)) {
                    if(!dest[p]) {
                        dest[p] = source[p];
                    } else {
                        dest[p] = superExtend(dest[p], source[p]);
                    }
                }
            }
            return dest;
        } else {
            return source;
        }
    }

    function loadMode(path, callback) {
        settingsfs.readFile(path, function(err, text) {
            if(err) {
                return callback && callback(err);
            }
            try {
                var json = JSON.parse(text);
                var filename = path.split("/")[2];
                var parts = filename.split(".");
                var language = parts[0];
                var type = parts[1];
                var mode;
                if (type === "default") {
                    json.language = language;
                    // Overwrite existing mode
                    mode = json;
                } else if (type === "user") {
                    mode = superExtend(modes[language], json);
                }
                // Normalize
                if(!mode.events) {
                    mode.events = {};
                }
                if(!mode.commands) {
                    mode.commands = {};
                }
                if(!mode.snippets) {
                    mode.snippets = {};
                }
                modes[language] = mode;
            } catch (e) {
                console.error("Error loading mode:", e);
            } finally {
                callback && callback();
            }
        });
    }

    function loadModes() {
        settingsfs.listFiles(function(err, paths) {
            if (err) {
                return console.error("Could not load settings file list");
            }
            modes = bareMinimumModes();
            // Sorting to ensure "default" comes before "user"
            paths.sort();
            async.forEach(paths, function(path, next) {
                if (path.indexOf("/mode/") === 0) {
                    loadMode(path, next);
                } else {
                    next();
                }
            }, function() {
                extensionMapping = {};
                Object.keys(modes).forEach(function(language) {
                    var mode = modes[language];
                    if (mode.extensions) {
                        mode.extensions.forEach(function(ext) {
                            extensionMapping[ext] = language;
                        });

                    }
                    var userModePath = "/mode/" + language + ".user.json";
                    settingsfs.watchFile(userModePath, function() {
                        loadMode(userModePath);
                    });
                });
                eventbus.emit("modesloaded", exports);
                declareModeCommands();
                declareModeEvents();
            });
        });
    }

    function declareModeCommands() {
        Object.keys(modes).forEach(function(language) {
            var mode = modes[language];

            command.define("Editor:Mode:" + mode.name, {
                exec: function(edit, session) {
                    exports.setSessionMode(session, mode);
                },
                readOnly: true
            });

            Object.keys(mode.commands).forEach(function(name) {
                var cmd = mode.commands[name];
                var existingCommand = command.lookup(name);
                if (!existingCommand) {
                    var modeCommands = {};
                    modeCommands[mode.language] = cmd;
                    var commandSpec = {
                        exec: function(edit, session) {
                            require(["./sandbox"], function(sandbox) {
                                var cmd = commandSpec.modeCommand[session.mode.language];
                                if (cmd) {
                                    sandbox.execCommand(cmd, session, function(err) {
                                        if (err) {
                                            return console.error(err);
                                        }
                                    });
                                } else {
                                    eventbus.emit("sessionactivityfailed", session, "Command " + name + " not supported for this mode");
                                }
                            });
                        },
                        readOnly: true,
                        modeCommand: modeCommands
                    };
                    command.define(name, commandSpec);
                } else {
                    existingCommand.modeCommand[mode.language] = cmd;
                }
            });
        });
        eventbus.emit("commandsloaded");
    }

    var eventHandlerFn;
    var lastEventPath;

    function triggerSessionCommandEvent(session, eventname, debounceTimeout) {
        var mode = session.mode;
        if(!mode) {
            return;
        }
        var path = session.filename;
        var commandNames = mode.events[eventname];

        function runCommands() {
            require(["./editor"], function(editor) {
                var edit = editor.getActiveEditor();
                commandNames.forEach(function(commandName) {
                    command.exec(commandName, edit, session);
                });
            });
        }

        if (commandNames) {
            if (debounceTimeout) {
                if (path !== lastEventPath) {
                    eventHandlerFn = _.debounce(runCommands, debounceTimeout);
                    lastEventPath = path;
                }
                eventHandlerFn();
            } else {
                runCommands();
            }
        }

        return !!commandNames;
    }

    function declareModeEvents() {
        eventbus.on("sessionchanged", function(session) {
            triggerSessionCommandEvent(session, "change", 1000);
        });
        eventbus.on("modeset", function(session) {
            triggerSessionCommandEvent(session, "change");
        });
        eventbus.on("preview", function(session) {
            var didPreview = triggerSessionCommandEvent(session, "preview");
            if(!didPreview) {
                require(["./preview"], function(preview) {
                    preview.showPreview("Not supported.");
                    eventbus.emit("sessionactivityfailed", session, "No preview available");
                });
            }
        });
    }

    exports.hook = function() {
        loadModes();
    };

    exports.get = function(language) {
        return modes[language];
    };

    exports.getModeForPath = function(path) {
        var parts = path.split(".");
        var ext = parts[parts.length - 1];
        if (extensionMapping[ext]) {
            return modes[extensionMapping[ext]];
        } else {
            return modes.text;
        }
    };

    exports.setSessionMode = function(session, mode) {
        if (typeof mode === "string") {
            mode = exports.get(mode);
        }
        if (mode) {
            session.mode = mode;
            session.setMode(mode.highlighter);
            eventbus.emit("modeset", session, mode);
        }
    };
});