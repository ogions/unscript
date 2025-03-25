class ScriptReader {
    constructor() {
        this.REGEXES = {
            newlines: /[\n\r]([\n\r]*)/,
            author: /(written|screenplay) by/i,
            boneyardOpen: /^\/\*/,
            boneyardClose: /\*\/\s*$/,
            centered: /^>[^<>\n]+<$/,
            character: /^[^a-z]+(\(cont'd\))?$/,
            comment: /^\s*\[{2}[^\]\n]+\]{2}\s*$/,
            dualDialogue: /\s*\^\s*/,
            fileName: /^(.*)\.[^\.]+$/,
            pageBreak: /^={3,}\s*$/,
            parenthetical: /^\s*\(/,
            sceneHeading: /^(\d+\s*)*(INT\.|EXT\.|EST\.|(I|INT)\.?\/(E|EXT)\.?)[^\n]+$/i,
            transition: /^[^a-z]*TO:$/
        }
    }

    readFile(file) {
        if (file.type === "" && file.name.endsWith(".fadein")) {
            return this.parseFadeInFile(file);
        }
        if (file.type === "" && file.name.endsWith(".fdx")) {
            return this.parseFDXFile(file);
        }
        if (file.type === "text/plain" || (
            file.type === "" && file.name.endsWith(".fountain"))) {
                return this.parseFountainFile(file);
            }
        if (file.type === "" && file.name.endsWith(".highland")) {
            return this.parseHighlandFile(file);
        }
        if (file.type === "text/xml") {
            return this.parseOSFFile(file);
        }
        if (file.type === "application/pdf") {
            return this.parsePDFFile(file);
        }
    }

    async parseFadeInFile(file) {
        const FILE_PATH = "document.xml";
        const blob = await JSZip.loadAsync(file)
            .then((zip) => zip.file(FILE_PATH))
            .then((doc) => doc.async("blob"));
        const OSFFile = new File([blob], file.name);
        
        return this.parseOSFFile(OSFFile);
    }

    async parseFDXFile(file) {

        const FDX_MAP = new Map([
            ["Action", "action"],
            ["Character", "character"],
            ["Dialogue", "dialogue"],
            ["General", "general"],
            ["Parenthetical", "parenthetical"],
            ["Scene Heading", "sceneHeading"],
            ["Transition", "transition"]
        ]);

        function parseFDXParagraph(paragraph) {
            const type = FDX_MAP.get(paragraph.getAttribute("Type")) || "action";
            const scriptElement = new ScriptElement(type);
    
            // Dual dialogue
            if (type === "general" && paragraph.getElementsByTagName("DualDialogue").length > 0) {
                for (let dualDialogue of paragraph.getElementsByTagName("DualDialogue")) {
                    scriptElement.type = "dualDialogue";
                    scriptElement.left = [];
                    scriptElement.right = [];
                    let charactersFound = 0;
    
                    for (let subParagraph of dualDialogue.children) {
                        const subElement = parseFDXParagraph(subParagraph);
                        if (subElement.type === "character") charactersFound++;
    
                        if (charactersFound < 2) {
                            scriptElement.left.push(subElement);
                        } else {
                            scriptElement.right.push(subElement);
                        }
                    }
                }
                return scriptElement;
            }

            // Everything else
            scriptElement.textElements = [];
            for (let textNode of paragraph.getElementsByTagName("Text")) {
                let text = textNode.textContent;
                if (type === "character" || type === "sceneHeading" || type === "transition") {
                    text = text.toUpperCase();
                }
                let styles = [];
                if (textNode.getAttribute("Style")) {
                    styles = textNode.getAttribute("Style").split("+").map((s) => s.toLowerCase());
                }

                scriptElement.textElements.push(new TextElement(text, new Set(styles)));
            }
            return scriptElement;
        }

        const fileContent = await file.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(fileContent, "text/xml");

        // Title page
        const titlePage = new Map([
            ["title", file.name.match(this.REGEXES.fileName)[1]],
            ["author", "Anonymous"]
        ]);

        const titlePageContent = xml.getElementsByTagName("TitlePage")[0].getElementsByTagName("Content")[0].getElementsByTagName("Paragraph");
        let titlePageBlocks = [];
        for (let paragraph of titlePageContent) {
            let text = "";
            for (let textElement of paragraph.getElementsByTagName("Text")) {
                text += textElement.textContent;
            }
            if (text.length > 0) titlePageBlocks.push(text);
        }

        // Body
    
        const paragraphs = xml.getElementsByTagName("Content")[0].children;
        const scriptElements = [];
    
        for (let paragraph of paragraphs) {
            scriptElements.push(parseFDXParagraph(paragraph));
        }

        // Element font settings
    
        const elementSettings = xml.getElementsByTagName("ElementSettings");
        const styles = new Map([]);
        for (let setting of elementSettings) {
            const type = FDX_MAP.get(setting.getAttribute("Type"));
            const elementStyles = setting.getElementsByTagName("FontSpec")[0].getAttribute("Style")
                                    .split("+")
                                    .map((s) => s.toLowerCase())
                                    .filter((s) => s != "allcaps");
            if (type && elementStyles.length > 0) styles.set(type, elementStyles);
        }

        return new Script(titlePage, scriptElements, styles);
    } 

    async parseFountainFile(file) {
        const REGEXES = this.REGEXES;
        const STYLE_REGEXES = {
            bold: /\*{2}/,
            escape: /\\/,
            italic: /\*/,
            underline: /_/
        }
        const BLANK_LINE_REGEX = /[\n\r]{2,}/;
        const KEY_REGEX = /^(\S[^:]+):\s*(.*)$/;

        function parseFountainLine(line, i) {
            if (line.length === 0) return;
            let type = "action";
            let isCentered = false;

            // Parse markdown to get styles
            let textElements = parseFountainMarkup(line);

            // Lyrics are currently unsupported and are interpreted as action.

            // Forced action
            if (line.charAt(0) === "!") {
                type = "action";
                trimLineStart(textElements);
                hasBlankLineBefore = false;
                return new ScriptElement(type, textElements);
            }

            // Forced character
            if (line.charAt(0) === "@") {
                type = "character";
                trimLineStart(textElements);
                isInsideDialogueBlock = true;
                hasBlankLineBefore = false;
                return new ScriptElement(type, textElements);
            }

            // Blank lines
            if (REGEXES.newlines.test(line)) {
                isInsideDialogueBlock = false;
                isInsideDualDialogueBlock = false;
                hasBlankLineBefore = true;
                return;
            }

            // Boneyard, page breaks, synopsis, comments, and section headings are unsupported by Unscript.

            // Boneyard
            if (REGEXES.boneyardOpen.test(line)) {
                isInsideBoneyard = true;
            }

            if (isInsideBoneyard && REGEXES.boneyardClose.test(line)) {
                isInsideBoneyard = false;
                return;
            }

            if (isInsideBoneyard) return;
    
            // Page breaks
            if (REGEXES.pageBreak.test(line)) {
                hasBlankLineBefore = false;
                return;
            }
    
            // Synopsis
            if (line.charAt(0) === "=") {
                return;
            }
    
            // Comments
            if (REGEXES.comment.test(line)) {
                return;
            }

            // Section headings
            if (line.charAt(0) === "#") {
                return;
            }

            // Forced scene headings
            if (line.length > 1 && line.charAt(0) === "." && line.charAt(1) != ".") {
                type = "sceneHeading";
                trimLineStart(textElements);
                hasBlankLineBefore = false;
                return new ScriptElement(type, textElements);
            }
            
            // Regular scene headings
            if (hasBlankLineBefore && REGEXES.sceneHeading.test(line)) {
                type = "sceneHeading";
                hasBlankLineBefore = false;
                return new ScriptElement(type, textElements);
            }

            // Transitions
            if (REGEXES.transition.test(line)) {
                type = "transition";
                hasBlankLineBefore = false;
                return new ScriptElement(type, textElements);
            }

            // Forced transitions and centered text
            if (line.length > 1 && line.charAt(0) === ">") {
                trimLineStart(textElements);
                hasBlankLineBefore = false;
                if (line.charAt(line.length - 1) === "<") {
                    trimLineEnd(textElements);
                    return new ScriptElement(type, textElements, true);
                }
                type = "transition";
                return new ScriptElement(type, textElements);
            }

            // Characters
            if (hasBlankLineBefore &&
                REGEXES.character.test(line) &&
                i + 1 < lines.length &&
                !REGEXES.newlines.test(lines[i + 1])) {

                    type = "character";

                    // Dual dialogue
                    if (REGEXES.dualDialogue.test(line)) {
                        for (let textElement of textElements) { textElement.text = textElement.text.replace(REGEXES.dualDialogue, "") };
                        const dualDialogueElement = new ScriptElement("dualDialogue");
                        dualDialogueElement.right = [new ScriptElement(type, textElements)];
                        dualDialogueElement.left = [];

                        let backIndex = scriptElements.length - 1;
                        let foundPreviousCharacter = false;
                        while (backIndex >= 0 && !foundPreviousCharacter) {
                            if (scriptElements[backIndex].type === "character") {
                                foundPreviousCharacter = true;
                            }
                            dualDialogueElement.left.unshift(scriptElements[backIndex]);
                            scriptElements.pop();
                            backIndex--;
                        }
                        hasBlankLineBefore = false;
                        isInsideDialogueBlock = true;
                        isInsideDualDialogueBlock = true;
                        return dualDialogueElement; 
                    } else {
                        hasBlankLineBefore = false;
                        isInsideDialogueBlock = true;
                        return new ScriptElement(type, textElements);
                    }
            }

            // Dialogue & parentheticals
            if (isInsideDialogueBlock) {
                if (!hasBlankLineBefore && REGEXES.parenthetical.test(line)) {
                    type = "parenthetical";
                } else {
                    type = "dialogue";
                }

                if (isInsideDualDialogueBlock) {
                    scriptElements[scriptElements.length - 1].right.push(new ScriptElement(type, textElements));
                    hasBlankLineBefore = false;
                    return;
                } else {
                    hasBlankLineBefore = false;
                    return new ScriptElement(type, textElements);
                }
            }

            if (REGEXES.centered.test(line)) {
                const firstTextElement = textElements[0];
                const lastTextElement = textElements[textElements.length - 1];
                firstTextElement.text = firstTextElement.text.substring(1).trimStart();
                lastTextElement.text = lastTextElement.text.substring(0, lastTextElement.text.length - 1).trimEnd();
                isCentered = true;
            }

            return new ScriptElement(type, textElements, isCentered);
        }

        function parseFountainMarkup(line) {
            if (REGEXES.newlines.test(line)) return [new TextElement(line)];

            function openStyle(style, startIndex, offset) {
                openStyles.add(style);
                openStyleStarts.set(style, startIndex - offset);
            }

            function closeStyle(style, endIndex, offset) {
                const startIndex = openStyleStarts.get(style);
                openStyles.delete(style);
                for (let k = startIndex; k < endIndex - offset; k++) {
                    chars[k].styles.add(style);
                }
            }

            function setsAreEqual(a, b) {
                return a.isSupersetOf(b) && a.isSubsetOf(b);
            }

            let chars = [];
            let openStyles = new Set();
            let openStyleStarts = new Map();
            let offset = 0;
            let escaped = false;

            for (let j = 0; j < line.length; j++) {
                if (!escaped) {
                    if (STYLE_REGEXES.bold.test(line.substring(j, j + 2))) {
                        openStyles.has("bold") ? closeStyle("bold", j, offset) : openStyle("bold", j, offset);
                        offset += 2;
                        j++;
                        continue;
                    } else if (STYLE_REGEXES.italic.test(line.charAt(j))) {
                        openStyles.has("italic") ? closeStyle("italic", j, offset) : openStyle("italic", j, offset);
                        offset += 1;
                        continue;
                    }
                    if (STYLE_REGEXES.escape.test(line.charAt(j))) {
                        escaped = true;
                        offset += 1;
                        continue;
                    }
                    if (STYLE_REGEXES.underline.test(line.charAt(j))) {
                        openStyles.has("underline") ? closeStyle("underline", j, offset) : openStyle("underline", j, offset);
                        offset += 1;
                        continue;
                    }
                }
                chars.push({ char: line.charAt(j), styles: new Set() });
                escaped = false;
            }

            let textElements = [];
            let textElement;
            for (let char of chars) {
                if (!textElement) {
                    textElement = new TextElement(char.char, char.styles);
                    continue;
                }
                if (!setsAreEqual(char.styles, textElement.styles)) {
                    textElements.push(textElement);
                    textElement = new TextElement(char.char, char.styles);
                    continue;
                }
                textElement.text += char.char;
            }
            textElements.push(textElement);

            return textElements;
        }

        function trimLineStart(textElements) {
            textElements[0].text = textElements[0].text.substring(1).trimStart();
        }

        function trimLineEnd(textElements) {
            textElements[textElements.length - 1].text = textElements[textElements.length - 1].text.slice(0, -1).trimEnd();
        }

        let fileContent = await file.text();
        fileContent = fileContent.trim();

        // Title page
        const titlePage = new Map([
            ["title", file.name.match(this.REGEXES.fileName)[1]],
            ["author", "Anonymous"]
        ]);

        const topOfDocument = fileContent.split(BLANK_LINE_REGEX, 1);
        const topLines = topOfDocument[0].split(REGEXES.newlines);

        let isTitlePage = false;
        let openKey = "";
        let openValue = "";
        for (let line of topLines) {
            if (line.length === 0) continue;
            const matched = line.match(KEY_REGEX);
            if (matched) {
                isTitlePage = true;

                // Close any open keys
                if (openKey) {
                    titlePage.set(openKey, openValue.trim());
                    openKey = "";
                    openValue = "";
                }

                let [match, key, value] = matched;
                key = key.toLowerCase();
                if (key === "authors") key = "author";

                if (value) {
                    titlePage.set(key, value);
                } else {
                    openKey = key;
                }
            } else {
                if (openKey) {
                    openValue += "\n" + line;
                }
            }
        }

        if (openKey) {
            titlePage.set(openKey, openValue);
        }

        if (isTitlePage) {
            fileContent = fileContent.replace(topOfDocument, "");
        }

        const lines = fileContent.split(REGEXES.newlines);

        // Script content
        let scriptElements = [];
        let i = -1;
        let isInsideBoneyard = false;
        let isInsideDialogueBlock = false;
        let isInsideDualDialogueBlock = false;
        let hasBlankLineBefore = true;

        for (let line of lines) {
            i++;
            const scriptElement = parseFountainLine(line, i);
            if (scriptElement) scriptElements.push(scriptElement);
        }

        return new Script(titlePage, scriptElements);
    }

    async parseHighlandFile(file) {
        const FILE_PATH = /text\.fountain/;
        const blob = await JSZip.loadAsync(file)
            .then((zip) => zip.file(FILE_PATH)[0])
            .then((bundle) => bundle.async("blob"));
        const fountainFile = new File([blob], file.name);

        return this.parseFountainFile(fountainFile);
    }

    async parseOSFFile(file) {

        const OSF_MAP = new Map([
            ["Action", "action"],
            ["Character", "character"],
            ["Dialogue", "dialogue"],
            ["General", "general"],
            ["Parenthetical", "parenthetical"],
            ["Scene Heading", "sceneHeading"],
            ["Transition", "transition"]
        ]);

        function parseOSFParagraph(paragraph) {
            const baseStyle = paragraph.getElementsByTagName("style")[0].getAttribute("basestyle");
            const type = OSF_MAP.get(baseStyle) || "action";
            const scriptElement = new ScriptElement(type);
            
            scriptElement.textElements = [];
            for (let textNode of paragraph.getElementsByTagName("text")) {
                let text = textNode.textContent;
                if (type === "character" || type === "sceneHeading" || type === "transition") {
                    text = text.toUpperCase();
                }
                const styles = new Set([]);
                for (let attribute of textNode.attributes) {
                    if (attribute.name === "bold" || attribute.name === "italic" || attribute.name === "underline") {
                        styles.add(attribute.name);
                    }
                }
                scriptElement.textElements.push(new TextElement(text, styles));
            }

            return scriptElement;
        }

        const fileContent = await file.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(fileContent, "text/xml");

        const titlePage = new Map([
            ["title", file.name.match(this.REGEXES.fileName)[1]],
            ["author", "Anonymous"]
        ]);

        const titlePageNode = xml.getElementsByTagName("titlepage")[0];
        if (titlePageNode) {
            const titlePageParagraphs = Array.from(xml.getElementsByTagName("titlepage")[0].getElementsByTagName("para"))
            .filter((para) => para.getElementsByTagName("text")[0].textContent);

            let isFirst = true;
            let isAuthor = true;
            for (let paragraph of titlePageParagraphs) {
                const text = paragraph.getElementsByTagName("text")[0].textContent;
                if (isFirst) {
                    titlePage.set("title", text);
                    isFirst = false;
                    continue;
                }
                if (paragraph.getAttribute("bookmark") === "Title") {
                    titlePage.set("title", text);
                    continue;
                }
                if (paragraph.getAttribute("bookmark") === "Author") {
                    titlePage.set("author", text);
                    continue;
                } 
                if (isAuthor) {
                    titlePage.set("author", text);
                    isAuthor = false;
                    continue;
                }
                if (this.REGEXES.author.test(text)) {
                    isAuthor = true;
                    continue;
                }
            }
        }

        const paragraphs = xml.getElementsByTagName("paragraphs")[0].getElementsByTagName("para");
        const scriptElements = [];
        for (let paragraph of paragraphs) {
            scriptElements.push(parseOSFParagraph(paragraph));
        }

        return new Script(titlePage, scriptElements);
    }

    async parsePDFFile(file) {
        let PDF_TOP_TRIM = 1;
        let PDF_RIGHT_TRIM = 1;
        let PDF_BOTTOM_TRIM = 1;
        let PDF_LEFT_TRIM = 1;
        const POSITION_ERROR_MARGIN = 10;
        const PDF_DPI = 72;
        const TITLE_PAGE_THRESHOLD = 20;
        const REGEXES = this.REGEXES;
        const SCENE_NUMBER_REGEX = /^([\d\s]*)(.+?)(?=[\d\s]*$)([\d\s]*)$/;
        // Weights are hand-selected based on trial and error.
        const WEIGHTS = [
            [2, 2, 2, 2, 2, 2],
            [1, 1, 1, 2, 8, 2],
            [1, 1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1, 1],
            [1, 5, 5, 5, 1, 1]
        ];
        const INDEX_TYPES = new Map([
            [0, "action"],
            [1, "character"],
            [2, "dialogue"],
            [3, "parenthetical"],
            [4, "sceneHeading"],
            [5, "transition"]
        ]);

        function modesOf(array) {
            let frequencyMap = new Map();
            for (let n of array) {
                if (!frequencyMap.has(n)) frequencyMap.set(n, 0);
                frequencyMap.set(n, frequencyMap.get(n) + 1);
            }
            const sorted = Array.from(frequencyMap).sort((a, b) => b[1] - a[1]);
            return sorted.map(([k, v]) => k);
        }

        function trim(pages, pageWidth, pageHeight) {
            for (let page of pages) {
                for (let i = page.length - 1; i >= 0; i--) {
                    if (page[i].transform[5] > pageHeight - (PDF_TOP_TRIM * PDF_DPI) + POSITION_ERROR_MARGIN ||
                        page[i].transform[4] > pageWidth - (PDF_RIGHT_TRIM * PDF_DPI) + POSITION_ERROR_MARGIN ||
                        page[i].transform[5] < (PDF_BOTTOM_TRIM * PDF_DPI) - POSITION_ERROR_MARGIN ||
                        page[i].transform[4] < (PDF_LEFT_TRIM * PDF_DPI) - POSITION_ERROR_MARGIN) {
                            page.splice(i, 1);
                        }
                }
            }
        }

        function collapseItems(pages) {
            for (let i = 0; i < pages.length; i++) {
                let collapsedItems = [];
                let baseItem;
                for (let item of pages[i]) {
                    if (!baseItem) {
                        baseItem = item;
                        continue;
                    }
                    if (item.transform[5] != baseItem.transform[5]) {
                        collapsedItems.push(baseItem);
                        baseItem = item;
                        continue;
                    }
                    baseItem.str += item.str;
                }
                collapsedItems.push(baseItem);
                pages.splice(i, 1, collapsedItems);
            }
        }

        function classifyLine(line, previousLineY, previousElement, isNewPage) {
            // Outer: margin, content, previous line distance, previous line type, dual dialogue
            // Inner: action, character, dialogue, parenthetical, scene heading, transition
            const scores = [[0, 0, 0, 0, 0, 0],
                            [0, 0, 0, 0, 0, 0],
                            [0, 0, 0, 0, 0, 0],
                            [0, 0, 0, 0, 0, 0],
                            [0, 0, 0, 0, 0, 0]];

            // Margins
            const lineX = line.transform[4];
            const lineY = line.transform[5];
            if (Math.abs(lineX - actionTransform) < POSITION_ERROR_MARGIN) {
                scores[0][0] = 1;
                scores[0][4] = 1;
            } else if (Math.abs(lineX - dialogueTransform) < POSITION_ERROR_MARGIN) {
                scores[0][2] = 1;
            } else if (Math.abs(lineX - characterTransform) < POSITION_ERROR_MARGIN) {
                scores[0][1] = 1;
            } else if (dialogueTransform - POSITION_ERROR_MARGIN < lineX &&
                       lineX < characterTransform + POSITION_ERROR_MARGIN) {
                scores[0][3] = 1;
            } else if (lineX > characterTransform) {
                scores[0][5] = 1;
            }


            // Content
            line.str = line.str.trim();
            scores[1][1] += REGEXES.character.test(line.str);
            scores[1][3] += REGEXES.parenthetical.test(line.str);
            scores[1][4] += REGEXES.sceneHeading.test(line.str);
            scores[1][0] += !REGEXES.sceneHeading.test(line.str);
            scores[1][5] += REGEXES.transition.test(line.str);

            // Previous line distance
            let hasBlankLineBefore;
            if (isNewPage) {
                hasBlankLineBefore = true;
            } else {
                if (previousLineY - lineY < line.height + POSITION_ERROR_MARGIN) {
                    hasBlankLineBefore = false;
                    scores[2][0] = 1;
                    scores[2][2] = 1;
                    scores[2][3] = 1;
                } else {
                    hasBlankLineBefore = true;
                    scores[2][1] = 1;
                    scores[2][4] = 1;
                    scores[2][5] = 1;
                }
            }

            if (hasBlankLineBefore) isWithinDualDialogue = false;

            // Previous line type
            if (previousElement) {
                switch(previousElement.type) {
                    case "action":
                        if (!hasBlankLineBefore) scores[3][0] = 1;
                        break;
                    case "character":
                        scores[3][2] = 1;
                        scores[3][3] = 1;
                        break;
                    case "dialogue":
                        if (!hasBlankLineBefore) scores[3][2] = 1;
                        break;
                    case "parenthetical":
                        scores[3][2] = 1;
                        scores[3][3] = 1;
                }

                // Dual dialogue
                if (isWithinDualDialogue) {
                    scores[4][2] = 1;
                    scores[4][3] = 1;
                } else if (previousElement.type === "action" &&
                    lineX > characterTransform + POSITION_ERROR_MARGIN &&
                    lineY > previousLineY &&
                    Math.abs(lastCharacterY - lineY) < POSITION_ERROR_MARGIN) {
                        previousElement.type = "dialogue";

                        const left = [];
                        const dualDialogueElement = new ScriptElement("dualDialogue");

                        let backIndex = scriptElements.length - 1;
                        let foundPreviousCharacter = false;
                        while (backIndex >= 0 && !foundPreviousCharacter) {
                            if (scriptElements[backIndex].type === "character") {
                                foundPreviousCharacter = true;
                            }
                            left.unshift(scriptElements[backIndex]);
                            scriptElements.pop();
                            backIndex--;
                        }
                        
                        dualDialogueElement.left = left;
                        dualDialogueElement.right = [];
                        scriptElements.push(dualDialogueElement);

                        hasBlankLineBefore = false;
                        isWithinDualDialogue = true;
                        scores[4][1] = 1;
                    }
            }

            // Calculate final scores
            const weightedScoreSums = [0, 0, 0, 0, 0, 0];
            for (let i = 0; i < scores.length; i++) {
                for (let j = 0; j < scores[i].length; j++) {
                    weightedScoreSums[j] += scores[i][j] * WEIGHTS[i][j];
                }
            }

            // Get type based on scores
            const indexOfHighest = weightedScoreSums.indexOf(Math.max(...weightedScoreSums));
            const type = INDEX_TYPES.get(indexOfHighest);

            if (type === "character") lastCharacterY = lineY;

            return new ScriptElement(type, [new TextElement(line.str)]);
        }

        const pdf = await file.bytes()
            .then((bytes) => pdfjsLib.getDocument(bytes).promise);
        let pages = [];
        let pageSizes = [];
        for (let p = 1; p <= pdf.numPages; p++) {
            const textContent = await pdf.getPage(p)
                .then((page) => {
                    pageSizes.push(page.getViewport().viewBox.slice(2, 4));
                    return page.getTextContent();
                })
                .then((content) => content.items.filter((item) => item.str));
            pages.push([...textContent]);
        }

        const pageWidth = modesOf(pageSizes.map(([a, b]) => a))[0];
        const pageHeight = modesOf(pageSizes.map(([a, b]) => b))[0];

        trim(pages, pageWidth, pageHeight);

        collapseItems(pages);

        // Title page

        const titlePage = new Map([
            ["title", file.name.match(this.REGEXES.fileName)[1]],
            ["author", "Anonymous"]
        ]);

        if (pages[0].length < TITLE_PAGE_THRESHOLD) {
            if (!pages[0][0]) return;
            titlePage.set("title", pages[0][0].str);
            let isAuthor = false;
            for (let line of pages[0]) {
                if (isAuthor) {
                    titlePage.set("author", line.str);
                    isAuthor = false;
                    continue;
                }
                if (REGEXES.author.test(line.str)) isAuthor = true;
            }

            pages = pages.slice(1);
        }

        // Get the most common x transforms to help with typing.
        // Assumes that action, dialogue, and characters are the three most common
        // elements in the script.
        // TODO: check against page size to ensure that results are within reasonable ranges.
        const xTransforms = pages.flat().map((line) => line ? line.transform[4] : undefined);
        const [actionTransform, dialogueTransform, characterTransform] = modesOf(xTransforms).slice(0, 3).sort((a, b) => a - b);

        const scriptElements = [];
        let isWithinDualDialogue = false;
        let lastCharacterY;

        for (let page of pages) {
            let previousLineY;
            let previousElement;
            let isNewPage = true;
            for (let line of page) {

                if (!line) continue;

                const scriptElement = classifyLine(line, previousLineY, previousElement, isNewPage)
                if (scriptElement) {

                    // This method doesn't currently handle styles,
                    // So we can assume everything is in a single text element.

                    if (scriptElement.type === "sceneHeading") {
                        console.log("Correcting text: " + scriptElement.textElements[0].text);
                        console.log(scriptElement.textElements[0].text.match(SCENE_NUMBER_REGEX));
                        scriptElement.textElements[0].text = scriptElement.textElements[0].text.replace(SCENE_NUMBER_REGEX, "$2").trim()
                    }
                    if (previousElement && previousElement.type === scriptElement.type && previousLineY - line.transform[5] < line.height + POSITION_ERROR_MARGIN) {
                        let lastTextElement = previousElement.textElements[previousElement.textElements.length - 1];
                        lastTextElement.text += " ";
                        lastTextElement.text += scriptElement.textElements[0].text;
                    } else if (isWithinDualDialogue) {
                        scriptElements[scriptElements.length - 1].right.push(scriptElement);
                        previousElement = scriptElement;
                    } else {
                        scriptElements.push(scriptElement);
                        previousElement = scriptElement;
                    }
                }

                previousLineY = line.transform[5];
                isNewPage = false;
                
            }
        }

        return new Script(titlePage, scriptElements);
    }
}
