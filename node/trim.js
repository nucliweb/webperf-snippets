const { readFile, writeFile } = require("fs/promises");

async function createNewFile(path) {
  try {
    let fileData = await readFile(path, "utf8");
    fileData = fileData.split("\n").join(" ");
    await writeFile("formatted.txt", fileData);
  } catch (e) {
    console.log(e);
  }
}

createNewFile("urls.txt");
