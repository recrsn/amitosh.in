const chokidar = require("chokidar");
const fs = require("fs").promises;
const path = require("path");
const postcss = require("postcss");
const tailwindcss = require("tailwindcss");
const config = require("./tailwind.config");
const autoprefixer = require("autoprefixer");
const postcssImport = require("postcss-import");
const nesting = require("tailwindcss/nesting");
const cssnano = require("cssnano");
const { optimize } = require("svgo");
const yaml = require("js-yaml");
const handlebars = require("handlebars");

function dest(path) {
	return path.replace(/^src/, "build");
}

async function processSvg(src, dest) {
	console.log(`[SVG] ${src} -> ${dest}`);
	const svg = await fs.readFile(src, "utf-8");
	const result = optimize(svg, { path: src });
	await fs.mkdir(path.dirname(dest), { recursive: true });
	await fs.writeFile(dest, result.data);
}

async function processCss(src, dest) {
	console.log(`[CSS] ${src} -> ${dest}`);
	const css = await fs.readFile(src, "utf-8");
	const result = await postcss([
		tailwindcss(config),
		postcssImport,
		nesting,
		autoprefixer,
		cssnano,
	]).process(css, { from: src, to: dest });
	await fs.mkdir(path.dirname(dest), { recursive: true });
	await fs.writeFile(dest, result.css);
}

async function copy(src, dest) {
	console.log(`[COPY] ${src} -> ${dest}`);
	const parent = path.dirname(dest);
	await fs.mkdir(parent, { recursive: true });
	await fs.copyFile(src, dest);
}

async function processTemplate(src, dest) {
	console.log(`[TEMPLATE] ${src} -> ${dest}`);
	const templateContent = await fs.readFile(src, "utf-8");
	const dataPath = path.join(path.dirname(src), "data", "resume.yaml");
	const dataContent = await fs.readFile(dataPath, "utf-8");
	const data = yaml.load(dataContent);

	const template = handlebars.compile(templateContent);
	const output = template(data);

	await fs.mkdir(path.dirname(dest), { recursive: true });
	await fs.writeFile(dest, output);
}

async function processFile(src) {
	const destPath = dest(src);
	if (src.endsWith(".css")) {
		await processCss(src, destPath);
	} else if (src.endsWith(".svg")) {
		await processSvg(src, destPath);
	} else if (src.endsWith(".template.html")) {
		const finalDestPath = destPath.replace(".template.html", ".html");
		await processTemplate(src, finalDestPath);
		await processCss("src/styles/index.css", "build/styles/index.css");
	} else if (src.endsWith(".yaml") || src.includes("/data/")) {
		// Skip data files and YAML files
		return;
	} else {
		if (src.endsWith(".html")) {
			await processCss("src/styles/index.css", "build/styles/index.css");
		}
		await copy(src, destPath);
	}
}

async function clean() {
	await fs.rm("build", { recursive: true, force: true });
}

async function fsReadDirRecursive(src) {
	const files = [];
	const entries = await fs.readdir(src, { withFileTypes: true });
	for (const entry of entries) {
		const filePath = path.join(src, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await fsReadDirRecursive(filePath)));
		} else {
			files.push(filePath);
		}
	}
	return files;
}

if (process.argv[2] === "watch") {
	console.log("Watching for changes...");
	chokidar
		.watch("src")
		.on("add", processFile)
		.on("change", processFile)
		.on("unlink", async (src) => {
			console.log(`[DELETE] ${src} -> ${dest(src)}`);
			await fs.unlink(dest(src));
		});
} else {
	(async () => {
		await clean();
		const files = await fsReadDirRecursive("src");
		for (const file of files) {
			await processFile(file);
		}
	})().catch(console.error);
}
