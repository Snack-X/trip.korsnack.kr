/**
 * Original from https://github.com/rafinskipg/wintersmith-libsass
 * Decaffeinated with `decaffeinate` (https://decaffeinate-project.org)
 * Modified by Snack (https://korsnack.kr, Github:Snack-X)
 */

/* Wintersmith Sass Plugin */

const fs   = require('fs');
const path = require('path');
const sass = require('node-sass');

const defaults = {
  includePaths: [],
  indentedSyntax: false,
  indentType: 'space',
  indentWidth: 2,
  linefeed: 'lf',
  omitSourceMapUrl: false,
  outputStyle: 'nested',
  precision: 5,
  sourceComments: false,
  sourceMap: undefined,
  sourceMapContents: false,
  sourceMapEmbed: false,
  sourceMapRoot: undefined,
};

module.exports = function(env, callback) {
  const config = Object.assign({}, defaults, env.config.sass);

  class NodeSassPlugin extends env.ContentPlugin {
    constructor(filepath) {
      super();

      this.filepath = filepath;
    }

    isPartial() {
      return /^_/.test(this.filepath.name);
    }

    getFilename() {
      return this.filepath.relative.replace(/\.s[ac]ss$/, '.css');
    }

    getPluginInfo() {
      if (this.isPartial()) return 'excluded';
      else return super.getPluginInfo();
    }

    getView() {
      if(this.isPartial()) return 'none';

      return function(env, locals, contents, templates, callback) {
        const renderConfig = Object.assign({}, config, { file: this.filepath.full });

        return sass.render(renderConfig, function(err, css) {
            if (err) callback(new Error(err));
            return callback(null, new Buffer(css.css));
        });
      };
    }

    static fromFile(filepath, callback) {
      const parsed = path.parse(filepath.relative);
      filepath.name = parsed.base;

      if (config.includePaths.indexOf(parsed.dir) < 0)
        config.includePaths.push(parsed.dir);

      const plugin = new NodeSassPlugin(filepath);
      return callback(null, plugin);
    }
  }

  env.registerContentPlugin('styles', '**/*.s[ac]ss', NodeSassPlugin);

  return callback();
};
