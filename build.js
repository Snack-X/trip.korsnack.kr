const fs = require("mz/fs"), READ_OPT = { encoding: "utf8" };
const path = require("path");

const YAML = require("js-yaml");
const rimraf = require("rimraf");
const MarkdownIt = require("markdown-it"),
      md = new MarkdownIt({ breaks: true, linkify: true });
const Handlebars = require("handlebars");
const HTMLMinify = require("html-minifier").minify,
      HTML_MIN_OPT = { collapseWhitespace: true },
      htmlMinify = html => HTMLMinify(html, HTML_MIN_OPT);
const ExifImage = require("exif").ExifImage;
const cheerio = require("cheerio");

let tplMain, tplTravel, tplPost;

//==============================================================================

build(__dirname, __dirname + "/docs")
  .then(() => {
    console.log("--[[ Build succeeded ]]--");
    process.exitCode = 0;
  })
  .catch(err => {
    console.error("--[[ Build failed ]]--");
    console.error(err.stack);
    process.exitCode = 1;
  });

//==============================================================================
// Magic happens here

async function build(basepath, outDir) {
  const travelEntries = await findTravels(basepath);
  const travels = await readTravels(basepath, travelEntries);

  await cleanFiles(outDir);

  await prepareRenderer(basepath);

  await renderTravels(basepath, outDir, travels);
  await renderPosts(basepath, outDir, travels);
  await renderMain(basepath, outDir, travels);

  await copyCountryFlags(basepath, outDir, travels);
}

//==============================================================================
// More magic happens here

async function findTravels(basepath) {
  const postsPath = path.join(basepath, "_posts");
  const entries = (await fs.readdir(postsPath)).sort().reverse();
  const travels = [];

  for(const entry of entries) {
    const fullPath = path.join(postsPath, entry);
    const stat = await fs.stat(fullPath);

    if(stat.isDirectory()) travels.push(entry);
  }

  return travels;
}

async function readTravels(basepath, travelEntries) {
  const travels = {};

  for(const travelEntry of travelEntries) {
    const travel = {};
    const travelPath = path.join(basepath, "_posts", travelEntry);
    const files = (await fs.readdir(travelPath)).sort();
    let info;

    if(files.includes("info.json"))
      info = await parseTravelInfo(path.join(travelPath, "info.json"));
    if(!info) continue;

    travel.metadata = {
      id: travelEntry,
      name: info.name,
      country: info.country.toLowerCase(),
      start: info.start,
      end: info.end,
    };

    travel.posts = [];

    for(const postEntry of files) {
      if(!postEntry.endsWith(".md")) continue;

      const postPath = path.join(travelPath, postEntry);

      // Read each posts
      const post = await readPost(postPath);
      if(!post) continue;
      post.filename = path.parse(postEntry).name;
      travel.posts.push(post);
    }

    travels[travelEntry] = travel;
  }

  return travels;
}

async function parseTravelInfo(filepath) {
  try {
    const content = await fs.readFile(filepath, READ_OPT);
    let parsed;

    if(filepath.endsWith(".json")) parsed = JSON.parse(content);
    else return false; // Won't happen

    if(!parsed.name || !parsed.country || !parsed.start || !parsed.end) return false;

    return parsed;
  } catch(err) {
    console.error(`Error while reading travel info from '${filepath}'`);
    console.error(err);
    return false;
  }
}

async function readPost(filepath) {
  const content = await fs.readFile(filepath, READ_OPT);

  const match = content.match(/^----*[\r\n]+([\s\S]+?)[\r\n]+----*\s+([\s\S]+)/);
  if(!match) return false;

  const metadata = YAML.safeLoad(match[1]);
  return { metadata, content: match[2] };
}

async function cleanFiles(outDir) {
  const entries = await fs.readdir(outDir);
  const KEEP = [ "assets", "images", "photos", "CNAME" ];

  for(const entry of entries) {
    if(KEEP.includes(entry)) continue;

    await removeFiles(path.join(outDir, entry));
  }

  // Remove flags
  await removeFiles(path.join(outDir, "assets/images/flag-*.svg"));
}

function removeFiles(pattern) {
  return new Promise((resolve, reject) => {
    rimraf(pattern, err => {
      if(err) reject(err);
      else resolve();
    });
  })
}

async function prepareRenderer(basepath) {
  const tplPath = path.join(basepath, "_templates");

  const pageStart = await fs.readFile(tplPath + "/page-start.html", READ_OPT);
  const pageEnd   = await fs.readFile(tplPath + "/page-end.html", READ_OPT);

  Handlebars.registerPartial("pageStart", pageStart);
  Handlebars.registerPartial("pageEnd", pageEnd);

  const srcMain   = await fs.readFile(tplPath + "/main.html", READ_OPT);
  // const srcTravel = await fs.readFile(tplPath + "/travel.html", READ_OPT);
  const srcPost   = await fs.readFile(tplPath + "/post.html", READ_OPT);

  tplMain   = Handlebars.compile(srcMain);
  // tplTravel = Handlebars.compile(srcTravel);
  tplPost   = Handlebars.compile(srcPost);
}

async function renderTravels(basepath, outDir, travels) {
  for(const id in travels) {
    const travelDir = path.join(outDir, id);

    try { await fs.mkdir(travelDir); } catch(err) { }

    // Per-travel index pages should be rendered at here eventually
    // But IMO I don't need it for now
  }
}

async function renderPosts(basepath, outDir, travels) {
  for(const id in travels) {
    const travel = travels[id].metadata;

    for(const post of travels[id].posts) {
      await _renderPost(outDir, travel, post);
    }
  }
}

async function _renderPost(outDir, travel, post) {
  let rendered = md.render(post.content);
  rendered = await _attachExifData(outDir, rendered);
  post.rendered = rendered;

  let html = tplPost({ travel, post });
  html = htmlMinify(html);

  const filename = travel.id + "/" + post.filename + ".html";
  const filePath = path.join(outDir, filename);
  await fs.writeFile(filePath, html);
  console.log(`Generated '${filename}'`);
}

async function renderMain(basepath, outDir, travels) {
  let html = tplMain({ travels });
  html = htmlMinify(html);

  await fs.writeFile(path.join(outDir, "index.html"), html);
  console.log("Generated 'index.html'");
}

async function copyCountryFlags(basepath, outDir, travels) {
  const flagInDir = path.join(basepath, "node_modules/flag-icon-css/flags/4x3");
  const flagOutDir = path.join(outDir, "assets/images");

  for(const id in travels) {
    const travel = travels[id];
    const country = travel.metadata.country;

    const inPath = `${flagInDir}/${country}.svg`;
    const outPath = `${flagOutDir}/flag-${country}.svg`;

    // Check existing flag images
    // fs.existsSync is not async, but this is handy
    if(fs.existsSync(outPath)) continue;

    // Copy from node_modules
    if(!fs.existsSync(inPath)) continue;

    console.log(`Copying country flag '${country}.svg'`);
    await _copyFile(inPath, outPath);
  }
}

async function _attachExifData(outDir, html) {
  const $ = cheerio.load(html, { xmlMode: true, decodeEntities: false }),
        $images = $("img");

  for(let i = 0 ; i < $images.length ; i++) {
    const $img = $images.eq(i);
    const src = $img.attr("src");

    if(src.startsWith("/photos") && src.toLowerCase().endsWith(".jpg")) {
      const exif = await _getExif(path.join(outDir, src));

      const output = [];
      if(exif.image.Make) output.push(exif.image.Make);
      if(exif.image.Model) output.push(exif.image.Model);
      if(exif.exif.FNumber) output.push("F/" + exif.exif.FNumber);
      if(exif.exif.ISO) output.push("ISO-" + exif.exif.ISO);
      if(exif.exif.DateTimeOriginal) output.push(exif.exif.DateTimeOriginal);

      if(output.length === 0) continue;
      $img.after(`<p class="exif">${output.join(" | ")}</p>`);
    }
  }

  return $.html();
}

function _copyFile(src, dst) {
  return new Promise((resolve, reject) => {
    fs.access(src, fs.F_OK, err => {
      if(err) { reject(err); return; }

      const ifs = fs.createReadStream(src);
      const ofs = fs.createWriteStream(dst);
      const onError = err => { ifs.destroy(); ofs.destroy(); reject(err); };

      ifs.on("error", onError);
      ofs.on("error", onError);

      ofs.on("finish", resolve);

      ifs.pipe(ofs);
    });
  });
}

function _getExif(src) {
  return new Promise((resolve, reject) => {
    try {
      new ExifImage({ image: src }, (err, exifData) => {
        if(err) reject(err);
        else resolve(exifData);
      });
    } catch(err) { reject(err); }
  })
}
