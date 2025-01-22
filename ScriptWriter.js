class ScriptWriter {
    
    async writeFile(script, type) {
        switch(type) {
            case "epub":
                return await this.writeEPUBFile(script);
            case "fdx":
                return this.writeFDXFile(script);
            case "fountain":
                return this.writeFountainFile(script);
            case "osf":
                return this.writeOSFFile(script);
        }
    }

    async writeEPUBFile(script) {
        const EPUB_TEMPLATE_MIMETYPE = "application/epub+zip";
        const EPUB_TEMPLATE_CONTAINER_XML = `<?xml version="1.0"?>
            <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
                <rootfiles>
                    <rootfile
                        full-path="OEBPS/script.opf"
                        media-type="application/oebps-package+xml" />
                </rootfiles>
            </container>`;
        const EPUB_TEMPLATE_CSS = `
            .scene-heading {
                font-size: 1em;
            }

            .action {
                margin: 1em 0;
            }

            .character {
                margin: 1em 0 0 36%;
                width: 76%;
            }

            .dialogue {
                margin: 0 0 0 12%;
                width: 76%;
            }

            .dual-dialogue {
                display: flex;
                width: 100%;
                gap: 1em;
            }

            .dual-dialogue-column {
                width: 50%;
                display: flex;
                flex-direction: column;
                align-items: center;
            }

            .dual-dialogue .character {
                margin: 1em 0 0 0;
            }

            .dual-dialogue .dialogue {
                margin: 0 0 0 0;
                width: 100%;
            }

            .dual-dialogue .parenthetical {
                margin: 0 1.5em 0 1.5em;
            }

            .parenthetical {
                margin: 0 0 0 24%;
                width: 48%;
            }

            .scene-heading {
                margin: 2em 0 1em 0;
                width: 100%;
            }

            .transition {
                margin: 1em 0 -1em 0;
                text-align: right;
            }
            `;
        function EPUB_TEMPLATE_PACKAGE(title = "Untitled", author = "Anonymous") {
            return `<?xml version="1.0"?>
            <package version="3.0" xmlns="http://www.idpf.org/2007/opf" xmlns:opf="http://www.idpf.org/2007/opf" unique-identifier="uid">
                <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
                    <dc:identifier id="uid">
                        urn:uuid:65637e3a-6979-4c31-b7d5-281ac8c3c64a
                    </dc:identifier>
                    <dc:title>
                        ${title}
                    </dc:title>
                    <dc:creator>
                        ${author}
                    </dc:creator>
                    <dc:language>
                        en
                    </dc:language>
                    <meta
                        property="dcterms:modified">
                        2016-01-01T00:00:01Z
                    </meta>
                </metadata>
                <manifest>
                    <item
                        properties="nav"
                        id="nav"
                        href="nav.xhtml"
                        media-type="application/xhtml+xml" />
                    <item
                        id="script"
                        href="script.xhtml"
                        media-type="application/xhtml+xml" />
                    <item
                        id="css"
                        href="style.css"
                        media-type="text/css" />
                </manifest>
                <spine>
                    <itemref idref="script" />
                </spine>
            </package>
            `;
        }
        function EPUB_TEMPLATE_CONTENT(title = "Untitled", elements = []) {
            return `<?xml version="1.0"?>
            <!DOCTYPE html>
                <html xmlns="http://www.w3.org/1999/xhtml" lang="en">
                    <head>
                        <meta charset="UTF-8" />
                        <title>${title}</title>
                        <link rel="stylesheet" href="style.css" />
                    </head>
                    <body>
                        ${elements.join("")}
                    </body>
                </html>
            `;
        }
        function EPUB_TEMPLATE_NAV(title = "Untitled") {
            return `<?xml version="1.0"?>
            <!DOCTYPE html>
                <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
                    <head>
                        <meta charset="UTF-8" />
                        <title>Table of Contents</title>
                    </head>
                    <body>
                        <nav epub:type="toc">
                            <h1>Table of Contents</h1>
                            <ol>
                                <li>
                                    <a href="script.xhtml">
                                        ${title}
                                    </a>
                                </li>
                            </ol>
                        </nav>
                    </body>
                </html>
            `;
        } 

        const zip = new JSZip();
        zip.file("mimetype", EPUB_TEMPLATE_MIMETYPE);
        zip.folder("META-INF").file("container.xml", EPUB_TEMPLATE_CONTAINER_XML);
        zip.folder("OEBPS").file("script.xhtml", EPUB_TEMPLATE_CONTENT(script.titlePage.get("title"), script.toHTML().map((e) => e.outerHTML)));
        zip.folder("OEBPS").file("nav.xhtml", EPUB_TEMPLATE_NAV(script.titlePage.get("title")));
        zip.folder("OEBPS").file("style.css", EPUB_TEMPLATE_CSS);
        zip.folder("OEBPS").file("script.opf", EPUB_TEMPLATE_PACKAGE(script.titlePage.get("title"), script.titlePage.get("author")));
        const file = await zip.generateAsync({ type: "blob" })
            .then((content) => new File([content], `${script.titlePage.get("title")}.epub`, { type: "application/epub+zip" }));
        
        return file;
    }

    writeFDXFile(script) {
        const FDX_MAP = new Map([
            ["action", "Action"],
            ["character", "Character"],
            ["dialogue", "Dialogue"],
            ["parenthetical", "Parenthetical"],
            ["sceneHeading", "Scene Heading"],
            ["transition", "Transition"]
        ]);
        const FDX_HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n`;

        // Basic setup
        const xml = document.implementation.createDocument(null, "FinalDraft");

        const fd = xml.documentElement;
        fd.setAttribute("DocumentType", "Script");
        fd.setAttribute("Template", "No");
        fd.setAttribute("Version", "1");

        const content = xml.createElement("Content");
        fd.appendChild(content);

        // Add content

        for (let scriptElement of script.scriptElements) {
            if (!scriptElement.textElements) continue;

            const paragraph = xml.createElement("Paragraph");
            const type = FDX_MAP.get(scriptElement.type) || "Action";
            paragraph.setAttribute("Type", type);
            content.appendChild(paragraph);

            for (let textElement of scriptElement.textElements) {
                const text = xml.createElement("Text");
                text.textContent = textElement.text;
                paragraph.appendChild(text);
            }
        }

        // Prettify
        function addWhitespace(node, indentLevel) {
            if (node.children.length === 0) return;
            for (let child of node.children) {
                const newline = xml.createTextNode("\n");
                node.insertBefore(newline, child);
                for (let i = 0; i <= indentLevel + 1; i++) {
                    const tab = xml.createTextNode("  ");
                    node.insertBefore(tab, child);
                }
                addWhitespace(child, indentLevel + 1);
            }
            const newline = xml.createTextNode("\n");
            node.appendChild(newline);
            for (let i = 0; i <= indentLevel; i++) {
                const tab = xml.createTextNode("  ");
                node.appendChild(tab);
            }
        }

        const newline = xml.createTextNode("\n");
        fd.insertBefore(newline, content);

        addWhitespace(fd, 0);

        let xmlText = FDX_HEADER + new XMLSerializer().serializeToString(xml);
        return new File([xmlText], `${script.titlePage.get("title")}.fdx`);
    }
    
    writeFountainFile(script) {
        const STYLE_STRINGS = new Map([
            ["bold", "**"],
            ["italic", "*"],
            ["underline", "_"]
        ])

        function writeFountainLine(scriptElement) {
            if (scriptElement.type === "pageBreak") {
                return "===";
            }

            let line = "";
            for (let textElement of scriptElement.textElements) {
                let styleString = "";
                for (let style of textElement.styles) {
                    styleString += STYLE_STRINGS.get(style);
                }
                line += styleString + textElement.text + styleString.split("").reverse().join("");
            }
            if (scriptElement.isCentered) line = "> " + line + " <";
            return line;
        }

        let fileContent = "";

        for (let scriptElement of script.scriptElements) {
            if (scriptElement.type === "dualDialogue") {
                fileContent += "\n";
                for (let leftElement of scriptElement.left) {
                    fileContent += writeFountainLine(leftElement);
                    fileContent += "\n";
                }
                fileContent += "\n";
                for (let rightElement of scriptElement.right) {
                    fileContent += writeFountainLine(rightElement);
                    if (rightElement.type === "character") fileContent += " ^";
                    fileContent += "\n";
                }
                continue;
            }

            if (scriptElement.type != "dialogue" && scriptElement.type != "parenthetical") fileContent += "\n";
            fileContent += writeFountainLine(scriptElement);
            fileContent += "\n";
        }

        return new File([fileContent], `${script.titlePage.get("title")}.fountain`);
    }

    writeOSFFile(script) {
        const OSF_MAP = new Map([
            ["action", "Action"],
            ["character", "Character"],
            ["dialogue", "Dialogue"],
            ["parenthetical", "Parenthetical"],
            ["sceneHeading", "Scene Heading"],
            ["transition", "Transition"]
        ]);
        const OSF_HEADER = `<?xml version="1.0" encoding="UTF-8"?>\n`;

        // Basic setup
        const xml = document.implementation.createDocument(null, "document");

        const doc = xml.documentElement;
        doc.setAttribute("type", "Open Screenplay Format document");
        doc.setAttribute("version", "40");
        
        const paragraphs = xml.createElement("paragraphs");
        doc.appendChild(paragraphs);

        // Add content
        for (let scriptElement of script.scriptElements) {
            if (!scriptElement.textElements) continue;

            const paragraph = xml.createElement("para");
            const type = OSF_MAP.get(scriptElement.type) || "Action";
            const style = xml.createElement("style");
            style.setAttribute("basestyle", type);
            paragraph.appendChild(style);
            paragraphs.appendChild(paragraph);

            for (let textElement of scriptElement.textElements) {
                const text = xml.createElement("text");
                text.textContent = textElement.text;
                paragraph.appendChild(text);
            }
        }

        // Prettify
        function addWhitespace(node, indentLevel) {
            if (node.children.length === 0) return;
            for (let child of node.children) {
                const newline = xml.createTextNode("\n");
                node.insertBefore(newline, child);
                for (let i = 0; i <= indentLevel + 1; i++) {
                    const tab = xml.createTextNode("  ");
                    node.insertBefore(tab, child);
                }
                addWhitespace(child, indentLevel + 1);
            }
            const newline = xml.createTextNode("\n");
            node.appendChild(newline);
            for (let i = 0; i <= indentLevel; i++) {
                const tab = xml.createTextNode("  ");
                node.appendChild(tab);
            }
        }

        addWhitespace(doc, 0);

        let xmlText = OSF_HEADER + new XMLSerializer().serializeToString(xml);
        return new File([xmlText], `${script.titlePage.get("title")}.xml`);
    }
}

export { ScriptWriter };