const COLUMNS = 4;
const MARGIN = 200;

async function fetchImage(url: string) {
    return fetch(url)
        .then((response) => response.arrayBuffer())
        .then((buffer) => new Uint8Array(buffer));
}

function cloneNodes(originalNode: SceneNode, count: number) {
    const nodes = [];
    let lastNode = originalNode;

    let i = count;
    while (i > 0) {
        let currentX = originalNode.x;
        let currentY = lastNode.y + lastNode.height + MARGIN;

        for (let j = 0; j < COLUMNS && i > 0; j++) {
        lastNode = originalNode.clone();
        lastNode.x = currentX;
        lastNode.y = currentY;

        figma.currentPage.appendChild(lastNode);
        nodes.push(lastNode);

        currentX = lastNode.x + lastNode.width + MARGIN;
        i--;
        }
    }

    return nodes;
}

function removeLeadingTrailingCommas(text: string): string {
    return text.replace(/^,/, '').replace(/,$/, '');
}

function traverse(node: any, nodeData: any, leafCb: (node: any, nodeData: any) => void) {
    if (node.children) {
        return node.children.map((child: any) => traverse(child, nodeData, leafCb));
    } else {
        leafCb(node, nodeData);
    }
}

async function handleRectangle(node: RectangleNode, nodeData: any) {
    if (nodeData[node.name] !== undefined) {
        try {
            const url = nodeData[node.name];
            const data = await fetchImage(url);
            const image = figma.createImage(data).hash;

            node.fills = [{
                type: 'IMAGE',
                opacity: 1,
                blendMode: 'NORMAL',
                scaleMode: 'FILL',
                imageHash: image,
            }];
        } catch (error) {
            console.error('Failed to replace image', error);
        }
    }
}

async function handleText(node: TextNode, nodeData: any) {
    if (nodeData[node.name] !== undefined) {
        node.characters = nodeData[node.name];
    } else {
        const patternMap = Object.keys(nodeData).reduce((patternMap, key) => {
            patternMap[key] = `{${key}}`;
            return patternMap;
        }, {} as any);
        const patterns = Object.keys(patternMap).map(key => patternMap[key]);

        if (patterns.some((pattern) => node.characters.toLowerCase().includes(pattern))) {
            const text = removeLeadingTrailingCommas(
                Object.keys(patternMap).reduce(
                    (text, key) => text.replace(new RegExp(patternMap[key], 'gi'), nodeData[key] ?? ''),
                    node.characters,
                )
            );

            return figma.loadFontAsync(node.fontName as FontName)
                .then(() => {
                    node.characters = text;
                })
                .catch((error) => console.error('Failed to load font', error))
        }
    }
}

// This file holds the main code for the plugins. It has access to the *document*.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (see documentation).

// This shows the HTML page in "ui.html".
figma.showUI(__html__);

// Calls to "parent.postMessage" from within the HTML page will trigger this
// callback. The callback will be passed the "pluginMessage" property of the
// posted message.z
figma.ui.onmessage = msg => {
    const promises: Array<Promise<any>> = [];
    // One way of distinguishing between different types of messages sent from
    // your HTML page is to use an object with a "type" property like this.
    switch (msg.type) {
        case 'load-json': {
            if (!figma.currentPage.selection[0]) {
                console.log('Nothing is selected');
                break;
            }

            if (!msg.data) {
                console.log('Json data is empty');
                break;
            }

            const nodes = cloneNodes(figma.currentPage.selection[0], msg.data.length);

            const leafCallback = (node: any, nodeData: any) => {
                const type = node.type as NodeType

                switch (type) {
                    case 'RECTANGLE': {
                        promises.push(
                            handleRectangle(node, nodeData)
                        );
                        break;
                    }
                    case 'TEXT': {
                        promises.push(
                            handleText(node, nodeData)
                        );
                        break;
                    }
                    default: {
                        console.log('Unhandled node type', node.type, node.name);
                    }
                }
            }

            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                const nodeData = msg.data[i];

                traverse(node, nodeData, leafCallback);
            }
            break;
        }
        default: {
            console.log('Unknown message type', msg);
        }
    }

    // Make sure to close the plugin when you're done. Otherwise the plugin will
    // keep running, which shows the cancel button at the bottom of the screen.
    Promise.all(promises).then(() => figma.closePlugin());
};
