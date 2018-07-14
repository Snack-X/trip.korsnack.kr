/**
 * Original from https://github.com/jnordberg/wintersmith
 * Decaffeinated with `decaffeinate` (https://decaffeinate-project.org)
 * Modified by Snack (https://korsnack.kr, Github:Snack-X)
 */

/* Wintersmith Markdown Plugin w/ markdown-it */

const async = require('async');
const fs = require('fs');
const MarkdownIt = require('markdown-it');
const path = require('path');
const url = require('url');
const yaml = require('js-yaml');
const ExifImage = require('exif').ExifImage;

function __range__(left, right, inclusive) {
  let range = [];
  let ascending = left < right;
  let end = !inclusive ? right : ascending ? right + 1 : right - 1;
  for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
    range.push(i);
  }
  return range;
}

module.exports = function(env, callback) {
  // Extend markdown-it
  const md = new MarkdownIt({ html: true, breaks: true, linkify: true });
  const mdDefaultImage = md.renderer.rules.image;

  const reInternalJpg = /^\/.+\.jpg$/;
  const reYoutube = /^https?:\/\/(?:www\.)?(?:youtube\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\/?\?(?:\S*?&?v\=))|youtu\.be\/)([a-zA-Z0-9_-]{6,11})/;

  md.renderer.rules.image = function(tokens, idx, options, _env, self) {
    const token = tokens[idx], aIndex = token.attrIndex("src");
    const imgSrc = token.attrs[aIndex][1];

    if(reInternalJpg.test(imgSrc)) {
      const realpath = path.join(env.workDir, env.config.contents, imgSrc);
      const exif = new ExifImage(realpath).exifData;

      const outImg = mdDefaultImage(tokens, idx, options, _env, self);
      const outExif = [];
      if(exif.image.Make) outExif.push(exif.image.Make);
      if(exif.image.Model) outExif.push(exif.image.Model);
      if(exif.exif.FNumber) outExif.push("F/" + exif.exif.FNumber);
      if(exif.exif.ISO) outExif.push("ISO-" + exif.exif.ISO);
      if(exif.exif.DateTimeOriginal) outExif.push(exif.exif.DateTimeOriginal);

      let output = outImg;
      if(outExif.length > 0) output += `\n<p class="exif">${outExif.join(" | ")}</p>`;

      return output;
    }
    else if(reYoutube.test(imgSrc)) {
      const id = imgSrc.match(reYoutube)[1];
      return `<div class="embed-responsive embed-responsive-16by9"><iframe src="https://www.youtube.com/embed/${id}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe></div>`;
    }

    return mdDefaultImage(tokens, idx, options, _env, self);
  };

  // MarkdownPage class
  class MarkdownPage extends env.plugins.Page {
    constructor(filepath, metadata, markdown) {
      super();

      this.filepath = filepath;
      this.metadata = metadata;
      this.markdown = markdown;
    }

    getLocation(base) {
      const uri = this.getUrl(base);
      return uri.slice(0, +uri.lastIndexOf('/') + 1 || undefined);
    }

    getHtml(base) {
      return md.render(this.markdown);
    }
  }

  MarkdownPage.fromFile = function(filepath, callback) {
    return async.waterfall([
      callback => fs.readFile(filepath.full, callback),
      (buffer, callback) => MarkdownPage.extractMetadata(buffer.toString(), callback),
      (result, callback) => {
        const {markdown, metadata} = result;
        const page = new (this)(filepath, metadata, markdown);
        return callback(null, page);
      }
    ], callback);
  };

  MarkdownPage.extractMetadata = function(content, callback) {
    const parseMetadata = function(source, callback) {
      if (!(source.length > 0)) { return callback(null, {}); }
      try {
        return callback(null, yaml.load(source) || {});
      } catch (error) {
        if ((error.problem != null) && (error.problemMark != null)) {
          const lines = error.problemMark.buffer.split('\n');
          const markerPad = (__range__(0, error.problemMark.column, false).map((i) => ' ')).join('');
          error.message = `YAML: ${ error.problem }\n
${ lines[error.problemMark.line] }
${ markerPad }^\
`;
        } else {
          error.message = `YAML Parsing error ${ error.message }`;
        }
        return callback(error);
      }
    };

    // split metadata and markdown content
    let metadata = '';
    let markdown = content;

    if (content.slice(0, 3) === '---') {
      // "Front Matter"
      const result = content.match(/^-{3,}\s([\s\S]*?)-{3,}(\s[\s\S]*|\s?)$/);
      if ((result != null ? result.length : undefined) === 3) {
        metadata = result[1];
        markdown = result[2];
      }
    } else if (content.slice(0, 12) === '```metadata\n') {
      // "Winter Matter"
      const end = content.indexOf('\n```\n');
      if (end !== -1) {
        metadata = content.substring(12, end);
        markdown = content.substring(end + 5);
      }
    }

    return async.parallel({
      metadata(callback) {
        return parseMetadata(metadata, callback);
      },
      markdown(callback) {
        return callback(null, markdown);
      }
    }
    , callback);
  };

  // register the plugins
  env.registerContentPlugin('pages', '**/*.*(markdown|mkd|md)', MarkdownPage);

  // done!
  return callback();
};
