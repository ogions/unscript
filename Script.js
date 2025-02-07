class Script {
    constructor(titlePage = new Map([["title", "Untitled"], ["author", "Anonymous"]]), scriptElements = [], styles = new Map([])) {
        this.titlePage = titlePage;
        this.scriptElements = scriptElements;
        this.styles = styles;
    }

    toHTML() {
        const html = [];
        this.scriptElements.forEach((scriptElement) => {
            html.push(scriptElement.toHTMLElement());
        });
        return html;
    }
}

class ScriptElement {
    constructor(type = "action", textElements, isCentered) {
        this.type = type;
        if (textElements) this.textElements = textElements;
        if (isCentered) this.isCentered = true;
    }
    
    toHTMLElement() {
        if (this.type === "dualDialogue") {
            const block = document.createElement("div");
            const leftColumn = document.createElement("div");
            const rightColumn = document.createElement("div");

            block.classList.add("dual-dialogue");
            leftColumn.classList.add("dual-dialogue-column");
            rightColumn.classList.add("dual-dialogue-column");

            block.appendChild(leftColumn);
            block.appendChild(rightColumn);

            this.left.forEach((scriptElement) => {
                leftColumn.appendChild(scriptElement.toHTMLElement())
            });
            this.right.forEach((scriptElement) => {
                rightColumn.appendChild(scriptElement.toHTMLElement())
            });

            return block;
        }

        const CLASS_MAP = new Map([
            ["action", "action"],
            ["character", "character"],
            ["dialogue", "dialogue"],
            ["dualDialogue", "dual-dialogue"],
            ["parenthetical", "parenthetical"],
            ["sceneHeading", "scene-heading"],
            ["transition", "transition"]
        ]);

        const elementType = (this.type === "sceneHeading") ? "h6" : "p";
        const e = document.createElement(elementType);
        e.classList.add(CLASS_MAP.get(this.type));
        if (this.isCentered) e.classList.add("centered");

        for (let textElement of this.textElements) {
            textElement.addToHTMLElement(e);
        }

        return e;
    }
}

class TextElement {
    constructor(text = "", styles = new Set([])) {
        this.text = text;
        this.styles = styles;
    }

    addToHTMLElement(baseElement) {
        const STYLE_MAP = new Map([
            ["bold", "strong"],
            ["italic", "em"],
            ["underline", "u"]
        ]);

        let targetElement = baseElement;
        for (let style of this.styles) {
            let styleElement = document.createElement(STYLE_MAP.get(style));
            targetElement.appendChild(styleElement);
            targetElement = styleElement;
        }
        targetElement.appendChild(document.createTextNode(this.text));
        return baseElement;
    }
}