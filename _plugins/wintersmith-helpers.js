module.exports = function(env, callback) {
  env.helpers.consoleLog = function(...arguments) {
    console.log(...arguments);
    return;
  };

  env.helpers.contentsUnder = function(_contents, path) {
    let contents = _contents;

    const segments = path.split("/").filter(segment => segment.trim() !== "");
    for(const segment of segments)
      contents = contents[segment];

    return contents;
  };

  env.helpers.filesUnder = function(_contents, path) {
    const contents = env.helpers.contentsUnder(_contents, path);

    const entries = Object.keys(contents);
    const output = [];

    for(const entry of entries) {
      if(!(contents[entry] instanceof env.ContentTree))
        output.push(entry);
    }

    return output;
  };

  env.helpers.directoriesUnder = function(_contents, path) {
    const contents = env.helpers.contentsUnder(_contents, path);

    const entries = Object.keys(contents);
    const output = [];

    for(const entry of entries) {
      if(contents[entry] instanceof env.ContentTree)
        output.push(entry);
    }

    return output;
  };

  env.helpers.articlesUnder = function(_contents, path) {
    const contents = env.helpers.contentsUnder(_contents, path);

    const entries = Object.keys(contents);
    const output = [];

    for(const entry of entries) {
      const c = contents[entry];
      if(!(c instanceof env.ContentTree) && c.template && c.template !== "none")
        output.push(entry);
    }

    return output;
  };

  return callback();
};
