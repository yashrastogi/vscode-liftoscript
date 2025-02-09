import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const formatCodeProvider = vscode.languages.registerDocumentFormattingEditProvider('liftoscript', {
        async provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
            const fullText = document.getText();
            const formatted = formatCode(fullText);
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(fullText.length)
            );
            return [vscode.TextEdit.replace(fullRange, await formatted)];
        }
    });

    context.subscriptions.push(formatCodeProvider);

    const foldingRangeProvider = vscode.languages.registerFoldingRangeProvider({ language: 'liftoscript' }, {
        provideFoldingRanges(document, context, token) {
            const ranges: vscode.FoldingRange[] = [];
            const lines = document.getText().split('\n');

            // Stack to hold headings along with their line number and level.
            const headingStack: { line: number, level: number }[] = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmedLine = line.trim();

                // Check if the line is a heading (starts with one or more '#')
                if (trimmedLine.startsWith('#')) {
                    // Extract the heading level (the number of '#' characters)
                    const match = trimmedLine.match(/^(#+)/);
                    if (!match) {
                        continue;
                    }
                    const level = match[1].length;

                    // Pop headings from the stack that are of equal or higher level than the current heading.
                    while (headingStack.length && headingStack[headingStack.length - 1].level >= level) {
                        const heading = headingStack.pop();
                        if (heading && heading.line < i - 1) {  // ensure there's at least one line to fold
                            ranges.push(new vscode.FoldingRange(heading.line, i - 1));
                        }
                    }

                    // Push the current heading onto the stack.
                    headingStack.push({ line: i, level });
                }
            }

            // After iterating through all lines, create folding ranges for any headings left in the stack.
            while (headingStack.length) {
                const heading = headingStack.pop();
                if (heading && heading.line < lines.length - 1) {
                    ranges.push(new vscode.FoldingRange(heading.line, lines.length - 1));
                }
            }

            return ranges;
        }
    });

    context.subscriptions.push(foldingRangeProvider);
}

async function formatCode(code: string): Promise<string> {
    const lines = code.split(/\r?\n/);
    let formattedLines: string[] = [];
    let inCustomBlock = false;
    let jsIndentLevel = 0; // Tracks additional indent inside JS custom blocks
    let insideSubheading = false;

    for (let line of lines) {
        let trimmedLine = line.trim();

        // Preserve empty lines
        if (trimmedLine === "") {
            formattedLines.push("");
            continue;
        }

        // Heading detection: "##" indicates subheading (1 indent) and "#" indicates top-level (no indent).
        if (trimmedLine.startsWith("##")) {
            formattedLines.push("    " + trimmedLine);
            insideSubheading = true;
            continue;
        } else if (trimmedLine.startsWith("#")) {
            formattedLines.push(trimmedLine);
            insideSubheading = false;
            continue;
        }

        // Determine base indent: 2 indents if inside a subheading, else none.
        const baseIndent = insideSubheading ? "        " : "";

        // Handle single-line custom blocks (with both "{~" and "~}" present)
        if (!inCustomBlock && trimmedLine.includes("{~") && trimmedLine.includes("~}")) {
            const startIndex = trimmedLine.indexOf("{~");
            const endIndex = trimmedLine.indexOf("~}") + 2;
            const beforeCustom = trimmedLine.substring(0, startIndex).trim();
            const customBlock = trimmedLine.substring(startIndex, endIndex).trim();
            const afterCustom = trimmedLine.substring(endIndex).trim();

            const formattedBefore = beforeCustom.replace(/\s*\/\s*/g, " / ");
            const combined =
                (formattedBefore ? formattedBefore + " " : "") +
                customBlock +
                (afterCustom ? " " + afterCustom : "");
            formattedLines.push(baseIndent + combined);
            continue;
        }

        // Start of a multi-line custom block
        if (!inCustomBlock && trimmedLine.includes("{~")) {
            const index = trimmedLine.indexOf("{~");
            const before = trimmedLine.substring(0, index).trim();
            const formattedBefore = before.replace(/\s*\/\s*/g, " / ");
            if (formattedBefore) {
                formattedLines.push(baseIndent + formattedBefore);
            }
            // Push the custom block start marker
            formattedLines[formattedLines.length - 1] += " " + trimmedLine.substring(index).trim()
            inCustomBlock = true;
            jsIndentLevel = 0; // Reset JS indent level on entering a custom block.
            continue;
        }

        // Process lines inside a custom block (JS formatting)
        if (inCustomBlock) {
            // If the line contains the end marker, output with base indent and exit block.
            if (trimmedLine.includes("~}")) {
                formattedLines.push(baseIndent + trimmedLine);
                inCustomBlock = false;
                jsIndentLevel = 0;
            }
            // For comment lines inside the custom block, use parent (base) indent only.
            else if (trimmedLine.startsWith("//")) {
                formattedLines.push(baseIndent + trimmedLine);
            }
            // For all other JS lines, apply additional indenting.
            else {
                let jsLine = trimmedLine;
                // If the line starts with a closing brace, reduce indent level first.
                if (jsLine.startsWith("}")) {
                    jsIndentLevel = Math.max(jsIndentLevel - 1, 0);
                }
                const jsIndent = "    ".repeat(jsIndentLevel + 1);
                formattedLines.push(baseIndent + jsIndent + jsLine);
                // If the line ends with an opening brace (and doesn’t also include a closing brace), increase indent level.
                if (jsLine.endsWith("{") && !jsLine.includes("}")) {
                    jsIndentLevel++;
                }
            }
            continue;
        }

        // For comment lines outside custom blocks, output with base indent.
        if (trimmedLine.startsWith("//")) {
            formattedLines.push(baseIndent + trimmedLine);
            continue;
        }

        // For all other lines, normalize spacing around the "/" delimiter and apply base indent.
        const formatted = trimmedLine.replace(/\s*\/\s*/g, " / ");
        formattedLines.push(baseIndent + formatted);
    }

    return formattedLines.join("\n");
}


export function deactivate() { }
