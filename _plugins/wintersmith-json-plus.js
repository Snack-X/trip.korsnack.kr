const async = require("async");
const fs = require("fs");
const path = require("path");

module.exports = function(env, callback) {
  function findIncludes(json, _prevPath = []) {
    const includes = [];

    Object.keys(json).forEach(key => {
      if(json[key]["@include"]) {
        const include = { keyPath: _prevPath.concat(key), filepath: json[key]["@include"] };
        if(json[key]["@include.path"]) include.includePath = json[key]["@include.path"];
        includes.push(include);
      }
      else if(typeof json[key] === "object") {
        const subIncludes = findIncludes(json[key], _prevPath.concat(key));
        if(subIncludes.length) includes.push.apply(includes, subIncludes);
      }
    });

    return includes;
  }

  function readJson(filepath) {
    return new Promise((resolve, reject) => {
      try {
        env.utils.readJSON(filepath, (err, json) => {
          if(err) reject(err);
          else resolve(json);
        });
      } catch(err) { reject(err); }
    });
  }

  function readJsonPlus(filepath, callback) {
    (async function() {
      const json = await readJson(filepath);

      while(true) {
        const includes = findIncludes(json);
        if(includes.length === 0) break;

        for(let i = 0 ; i < includes.length ; i++) {
          const include = includes[i];
          const subpath = path.resolve(path.dirname(filepath), include.filepath);
          const subJson = await readJson(subpath);

          let applyAt = json;
          for(let j = 0 ; j < include.keyPath.length - 1 ; j++)
            applyAt = applyAt[include.keyPath[j]];

          let toApply = subJson;
          if(include.includePath)
            include.includePath.forEach(key => { toApply = toApply[key]; });

          applyAt[include.keyPath[include.keyPath.length - 1]] = toApply;
        }
      }

      return json;
    })()
      .then(json => { callback(null, json); })
      .catch(err => { callback(err); });
  }

  const jsonPlusIsPage = filepath => /\.page\.json$/.test(filepath);
  const jsonPlusIsData = filepath => /\.data\.json$/.test(filepath);

  class JsonPlusPage extends env.plugins.Page {
    constructor(filepath, metadata) {
      super();

      this.filepath = filepath;
      this.metadata = metadata;
    }

    isPage() { return jsonPlusIsPage(this.filepath.relative); }
    isData() { return jsonPlusIsData(this.filepath.relative); }

    getFilename() {
      if(this.isPage())
        return this.filepath.relative.replace(/\.page\.json$/, ".html");
      else if(this.isData())
        return "";
      else
        return this.filepath.relative;
    }

    getPluginInfo() {
      if(this.isPage())
        return super.getPluginInfo();
      else if(this.isData())
        return "excluded";
      else
        return "as-is";
    }
  }

  JsonPlusPage.fromFile = function(filepath, callback) {
    if(jsonPlusIsPage(filepath.relative) || jsonPlusIsData(filepath.relative)) {
      return async.waterfall([
        async.apply(readJsonPlus, filepath.full),
        (json, callback) => {
          const page = new this(filepath, json);
          return callback(null, page);
        }
      ], callback);
    }
    else {
      const static = new env.plugins.StaticFile(filepath);
      return callback(null, static);
    }
  };

  // register the plugins
  env.registerContentPlugin('pages', '**/*.json', JsonPlusPage);

  return callback();
};
