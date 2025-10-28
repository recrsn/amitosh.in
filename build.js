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
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

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

async function processPdf(src, dest) {
	console.log(`[PDF] ${src} -> ${dest}`);

	// Copy the original PDF for download
	await fs.mkdir(path.dirname(dest), { recursive: true });
	await fs.copyFile(src, dest);

	// Extract the PDF name without extension
	const pdfName = path.basename(src, '.pdf');
	const outputDir = path.join(path.dirname(dest), pdfName);

	// Create directory for slide images
	await fs.mkdir(outputDir, { recursive: true });

	try {
		// Convert PDF to images using ImageMagick
		// -density 150: 150 DPI resolution
		// -quality 85: PNG quality
		// -alpha remove: remove transparency
		// -background white: use white background
		const outputPattern = path.join(outputDir, 'slide-%d.png');
		const command = `convert -density 150 -quality 85 -alpha remove -background white "${src}" "${outputPattern}"`;

		await execAsync(command);
		console.log(`[PDF] Converted ${src} to images in ${outputDir}`);

		// Create a metadata file with page count
		const files = await fs.readdir(outputDir);
		const slideImages = files
			.filter(f => f.startsWith('slide-') && f.endsWith('.png'))
			.sort((a, b) => {
				// Extract page numbers and sort numerically
				const aNum = parseInt(a.match(/slide-(\d+)\.png/)[1]);
				const bNum = parseInt(b.match(/slide-(\d+)\.png/)[1]);
				return aNum - bNum;
			});
		const metadata = {
			pageCount: slideImages.length,
			slides: slideImages
		};
		await fs.writeFile(
			path.join(outputDir, 'metadata.json'),
			JSON.stringify(metadata, null, 2)
		);
	} catch (error) {
		console.error(`[PDF] Error converting ${src}:`, error.message);
	}
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

	// Determine which data file to use based on the template name
	const templateName = path.basename(src, '.template.html');

	// Special handling for talks-list template
	if (templateName === 'talks-list') {
		await processTalksListTemplate(src, dest, templateContent);
		return;
	}

	// Special handling for talk-detail template
	if (templateName === 'talk-detail') {
		await processTalkDetailTemplates(src, templateContent);
		return;
	}

	// Map template names to data file names
	const dataFileMap = {
		'aboutme': 'resume',
		'talks': 'talks'
	};
	const dataFileName = dataFileMap[templateName] || templateName;
	const dataPath = path.join(path.dirname(src), "data", `${dataFileName}.yaml`);
	const dataContent = await fs.readFile(dataPath, "utf-8");
	const data = yaml.load(dataContent);

	const template = handlebars.compile(templateContent);
	const output = template(data);

	await fs.mkdir(path.dirname(dest), { recursive: true });
	await fs.writeFile(dest, output);
}

async function processTalksListTemplate(src, dest, templateContent) {
	const dataPath = path.join(path.dirname(src), "data", "talks.yaml");
	const dataContent = await fs.readFile(dataPath, "utf-8");
	const data = yaml.load(dataContent);

	// Add thumbnail path (first slide) to each talk
	data.talks = data.talks.map((talk, index) => {
		const pdfName = talk.slides.split('/').pop().replace('.pdf', '');
		return {
			...talk,
			thumbnailPath: `assets/talks/${pdfName}/slide-0.png`
		};
	});

	const template = handlebars.compile(templateContent);
	const output = template(data);

	// Output as talks.html (the main talks list page)
	const finalDest = path.join(path.dirname(dest), 'talks.html');
	await fs.mkdir(path.dirname(finalDest), { recursive: true });
	await fs.writeFile(finalDest, output);
}

async function processTalkDetailTemplates(src, templateContent) {
	const dataPath = path.join(path.dirname(src), "data", "talks.yaml");
	const dataContent = await fs.readFile(dataPath, "utf-8");
	const data = yaml.load(dataContent);

	const template = handlebars.compile(templateContent);

	// Generate a separate HTML file for each talk
	for (let i = 0; i < data.talks.length; i++) {
		const talk = data.talks[i];
		const output = template(talk);
		const destPath = path.join("build", `talk-${i}.html`);

		await fs.mkdir(path.dirname(destPath), { recursive: true });
		await fs.writeFile(destPath, output);
		console.log(`[TEMPLATE] Generated ${destPath} for talk: ${talk.title}`);
	}
}

async function processFile(src) {
	const destPath = dest(src);
	if (src.endsWith(".css")) {
		await processCss(src, destPath);
	} else if (src.endsWith(".svg")) {
		await processSvg(src, destPath);
	} else if (src.endsWith(".pdf") && src.includes("/assets/talks/")) {
		await processPdf(src, destPath);
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
