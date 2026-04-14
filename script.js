// Initialization
const canvas = new fabric.Canvas('canvas', {
    isDrawingMode: false,
    backgroundColor: 'rgba(255, 255, 255, 0)', // Transparente para la cuadrícula
    selection: true, // enable group selection
    allowTouchScrolling: false, // Critical for touch devices
    renderOnAddRemove: true,
    stateful: false, // Mejor rendimiento (no guarda estado extra por objeto)
    objectCaching: true, // Cache de objetos para renderizado rápido
    stopContextMenu: true, // Evita que menús contextuales interrumpan el tacto
});

// --- Referencias Globales de DOM (Fundamentales para GitHub Pages y carga asíncrona) ---
const geometryPalette = document.getElementById('geometry-palette');
const rulesPalette = document.getElementById('rules-palette');
const stickerPalette = document.getElementById('sticker-palette');
const diceTokenPalette = document.getElementById('dice-token-palette');
const sidePalette = document.getElementById('side-palette');

const btnGeometryMenu = document.getElementById('btn-geometry-menu');
const btnRulesMenu = document.getElementById('btn-rules-menu');
const btnDiceMenu = document.getElementById('btn-dice-menu');
const btnSystemIcons = document.getElementById('btn-system-icons');
const btnTogglePalette = document.getElementById('btn-toggle-palette');
const btnGrid = document.getElementById('btn-grid');
const gridLayer = document.getElementById('grid-layer');
const btnPlaceValueTable = document.getElementById('btn-place-value');

if (!diceTokenPalette) console.warn("Aviso: El panel de dados no se encontró en el HTML.");
if (!btnDiceMenu) console.warn("Aviso: El botón del menú de dados no se encontró en el HTML.");

// Fullscreen canvas setup
function resizeCanvas() {
    const wrapper = document.querySelector('.canvas-panel');
    if (wrapper) {
        canvas.setWidth(wrapper.clientWidth);
        canvas.setHeight(wrapper.clientHeight);
        canvas.renderAll();
    }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Set initial size

// Centralizar pizarra al inicio (en medio de la gran cuadrícula)
function centerCanvasAtStart() {
    const vpt = canvas.viewportTransform;
    vpt[4] = (canvas.width / 2) - 2000;
    vpt[5] = (canvas.height / 2) - 2000;
    canvas.requestRenderAll();
    if (window.updateGridBackground) window.updateGridBackground();
}
setTimeout(centerCanvasAtStart, 200);

// Custom Cursors for better touch feedback
const eraserSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="white" stroke="#2d3748" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`;
const eraserCursor = `url("data:image/svg+xml;utf8,${encodeURIComponent(eraserSvg)}") 16 16, auto`;

// Setup tools
let isErasing = false;
let isDrawingPolygon = false;
let isDrawingAngle = false;
let isDrawingLine = false;
let isDrawingArrow = false;
let anglePhase = 0;
let isMouseDown = false;
let lastMouseEvent;
let currentActiveTool = null; // Global state for the active tool

let activeLine;
let pointArray = [];
let lineArray = [];
let pointCircles = [];
let lineTempPts = [];
let activeLineId = null;
let angleTempPts = [];
let angleTempLines = [];
let angleTempCircles = [];
let activeAngleId = null;

// Botones de herramientas
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnSelect = document.getElementById('btn-select');
const btnMove = document.getElementById('btn-move');
const btnDraw = document.getElementById('btn-draw');
const btnLineTool = document.getElementById('btn-line');
const btnArrowTool = document.getElementById('btn-arrow');
const btnEraser = document.getElementById('btn-eraser');
const btnCustomPolygon = document.getElementById('btn-custom-polygon');
const btnAngle = document.getElementById('btn-angle');
const btnDelete = document.getElementById('btn-delete');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const btnCartesian = document.getElementById('btn-cartesian');

let swatches = document.querySelectorAll('.swatch');
let currentColor = '#2d3748';
let strokeWidthSlider = document.getElementById('stroke-width');
let currentPolygonSides = 5;
const sidesValueDisplay = document.getElementById('sides-value');
const btnSidesUp = document.getElementById('btn-sides-up');
const btnSidesDown = document.getElementById('btn-sides-down');
const btnStrokeUp = document.getElementById('btn-stroke-up');
const btnStrokeDown = document.getElementById('btn-stroke-down');
const strokeWidthLabel = document.getElementById('stroke-width-label');

// --- Sistema Undo/Redo ---
let undoStack = [];
let redoStack = [];
let isStateChanging = false;
const MAX_STACK_SIZE = 50;

function saveState() {
    if (isStateChanging) return;
    
    // Guardar estado actual en JSON
    const state = JSON.stringify(canvas.toJSON(['angleId', 'lineId', 'role', 'pA', 'pB', 'pC', 'angleArc', 'radius', 'selectionBackgroundColor']));
    
    // Si el último estado es igual al actual, no guardar (evitar duplicados)
    if (undoStack.length > 0 && undoStack[undoStack.length - 1] === state) return;

    undoStack.push(state);
    if (undoStack.length > MAX_STACK_SIZE) undoStack.shift();
    
    // Al realizar una nueva acción, limpiamos el historial de "Rehacer"
    redoStack = [];
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    btnUndo.disabled = undoStack.length <= 1; // El primer estado es la pizarra vacía
    btnRedo.disabled = redoStack.length === 0;
    
    btnUndo.style.opacity = btnUndo.disabled ? '0.4' : '1';
    btnRedo.style.opacity = btnRedo.disabled ? '0.4' : '1';
}

function undo() {
    if (undoStack.length <= 1) return;
    
    isStateChanging = true;
    const currentState = undoStack.pop();
    redoStack.push(currentState);
    
    const previousState = undoStack[undoStack.length - 1];
    canvas.loadFromJSON(previousState, () => {
        // Re-apply tool constraints to new loaded objects
        if (currentActiveTool) setActiveTool(currentActiveTool);
        
        canvas.renderAll();
        isStateChanging = false;
        updateUndoRedoButtons();
    });
}

function redo() {
    if (redoStack.length === 0) return;
    
    isStateChanging = true;
    const nextState = redoStack.pop();
    undoStack.push(nextState);
    
    canvas.loadFromJSON(nextState, () => {
        // Re-apply tool constraints to new loaded objects
        if (currentActiveTool) setActiveTool(currentActiveTool);
        
        canvas.renderAll();
        isStateChanging = false;
        updateUndoRedoButtons();
    });
}

// Inicializar estado inicial (vacío) - Retrasado para capturar la posición centrada
setTimeout(() => {
    saveState();
    if (window.updateGridBackground) window.updateGridBackground();
}, 500);

canvas.on('object:added', () => saveState());
canvas.on('object:modified', () => saveState());
canvas.on('object:removed', () => saveState());

btnUndo.addEventListener('click', undo);
btnRedo.addEventListener('click', redo);

const toolBtns = document.querySelectorAll('.tool-btn:not(#btn-delete)'); // Keep delete out of exclusive active states

// Initialize Drawing Brush
canvas.freeDrawingBrush.color = currentColor;
canvas.freeDrawingBrush.width = parseInt(strokeWidthSlider.value, 10);
// OPTIMIZACIÓN: Simplifica los puntos del trazo libre, mejorando drásticamente el rendimiento en touch
if (canvas.freeDrawingBrush) {
    canvas.freeDrawingBrush.decimate = 4;
}

function cancelAngleDrawing() {
    isDrawingAngle = false;
    anglePhase = 0;
    angleTempLines.forEach(l => canvas.remove(l));
    angleTempCircles.forEach(c => canvas.remove(c));
    angleTempLines = [];
    angleTempCircles = [];
    angleTempPts = [];
    canvas.requestRenderAll();
}

function cancelCustomPolygon() {
    isDrawingPolygon = false;
    if (activeLine) canvas.remove(activeLine);
    lineArray.forEach(l => canvas.remove(l));
    pointCircles.forEach(c => canvas.remove(c));
    pointArray = [];
    lineArray = [];
    pointCircles = [];
    activeLine = null;
    canvas.requestRenderAll();
}

function setActiveTool(activeBtn) {
    currentActiveTool = activeBtn; // Actualizar estado global
    if (isDrawingPolygon && activeBtn !== btnCustomPolygon) cancelCustomPolygon();
    if (isDrawingAngle && activeBtn !== btnAngle) cancelAngleDrawing();

    toolBtns.forEach(btn => btn.classList.remove('active'));
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    isErasing = (activeBtn === btnEraser);
    isDrawingPolygon = (activeBtn === btnCustomPolygon);
    isDrawingAngle = (activeBtn === btnAngle);
    isDrawingLine = (activeBtn === btnLineTool);
    isDrawingArrow = (activeBtn === btnArrowTool);
    const isMoving = (activeBtn === btnMove);

    
    // Custom Hand/Grab Cursor
    const svgHand = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2d3748" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v11"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`;
    const handCursor = `url("data:image/svg+xml;utf8,${encodeURIComponent(svgHand)}") 12 12, grab`;

    if (isErasing) {
        canvas.isDrawingMode = false;
        canvas.selection = false; 
        canvas.forEachObject(obj => {
            obj.selectable = false;
            obj.evented = true; // Necesario para detectar click de borrado
        });
        canvas.defaultCursor = eraserCursor;
        canvas.hoverCursor = eraserCursor;
    } else if (activeBtn === btnSelect) {
        // Flecha: Solo seleccionar (y mover objetos, comportamiento standard de flecha)
        canvas.isDrawingMode = false;
        canvas.selection = true;
        canvas.forEachObject(obj => {
            obj.selectable = true;
            obj.evented = true;
        });
        canvas.defaultCursor = 'default';
        canvas.hoverCursor = 'move';
    } else if (activeBtn === btnMove) {
        // Mano: SOLO Panear fondo (se evita seleccionar objetos por error)
        canvas.isDrawingMode = false;
        canvas.selection = false; 
        canvas.forEachObject(obj => {
            obj.selectable = false;
            obj.evented = false; 
        });
        canvas.defaultCursor = handCursor;
        canvas.hoverCursor = handCursor;
    } else {
        // Otros modos de dibujo
        canvas.isDrawingMode = (activeBtn === btnDraw);
        canvas.selection = false;
        canvas.forEachObject(obj => {
            obj.selectable = false;
            obj.evented = false; // Que no interfieran al dibujar
        });
        canvas.defaultCursor = 'crosshair';
        canvas.hoverCursor = 'crosshair';
    }
}

// Select tool (Mover)
btnSelect.addEventListener('click', () => {
    canvas.isDrawingMode = false;
    setActiveTool(btnSelect);
    document.querySelector('.canvas-container-wrapper').style.cursor = 'default';
});

// Hand tool (Mover con mano)
btnMove.addEventListener('click', () => {
    canvas.isDrawingMode = false;
    setActiveTool(btnMove);
    const svgHand = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2d3748" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v11"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`;
    const handCursor = `url("data:image/svg+xml;utf8,${encodeURIComponent(svgHand)}") 12 12, grab`;
    document.querySelector('.canvas-container-wrapper').style.cursor = handCursor;
});

// Pencil tool (Dibujar)
btnDraw.addEventListener('click', () => {
    canvas.isDrawingMode = true;
    canvas.discardActiveObject(); // deselect current objects
    canvas.requestRenderAll();
    setActiveTool(btnDraw);
    document.querySelector('.canvas-container-wrapper').style.cursor = 'crosshair';
});

// Eraser tool
btnEraser.addEventListener('click', () => {
    canvas.isDrawingMode = false;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setActiveTool(btnEraser);
});

// Line Tool (Recta)
btnLineTool.addEventListener('click', () => {
    canvas.isDrawingMode = false;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setActiveTool(btnLineTool);
    document.querySelector('.canvas-container-wrapper').style.cursor = 'crosshair';
});

// Arrow Tool
if (btnArrowTool) {
    btnArrowTool.addEventListener('click', () => {
        canvas.isDrawingMode = false;
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        setActiveTool(btnArrowTool);
        document.querySelector('.canvas-container-wrapper').style.cursor = 'crosshair';
    });
}

// Angle Tool
btnAngle.addEventListener('click', () => {
    canvas.isDrawingMode = false;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setActiveTool(btnAngle);
    document.querySelector('.canvas-container-wrapper').style.cursor = 'crosshair';
});

// Tabla de Valor Posicional
if (btnPlaceValueTable) {
    btnPlaceValueTable.addEventListener('click', () => {
        const center = canvas.getVpCenter();
        // Aparece en la parte superior visible de la pizarra actual
        const vpt = canvas.viewportTransform;
        const zoom = canvas.getZoom();
        // Colocamos la tabla centrada horizontalmente y en la parte superior (umbral de 120px desde arriba)
        const spawnY = (150 - vpt[5]) / zoom; 
        createPlaceValueTable(center.x, spawnY);
    });
}

// Lógica de Toggle para el panel lateral de colores
btnTogglePalette.addEventListener('click', (e) => {
    const isOpen = sidePalette.classList.contains('open');
    if (isOpen) {
        sidePalette.classList.remove('open');
        btnTogglePalette.classList.remove('active');
    } else {
        sidePalette.classList.add('open');
        btnTogglePalette.classList.add('active');
    }
    e.stopPropagation();
});

// No duplicar declaraciones const para evitar SyntaxError

function closeAllPanels() {
    if (geometryPalette) geometryPalette.classList.remove('open');
    if (rulesPalette) rulesPalette.classList.remove('open');
    if (stickerPalette) stickerPalette.classList.remove('open');
    if (diceTokenPalette) diceTokenPalette.classList.remove('open');
    
    if (btnGeometryMenu) btnGeometryMenu.classList.remove('active');
    if (btnRulesMenu) btnRulesMenu.classList.remove('active');
    if (btnSystemIcons) btnSystemIcons.classList.remove('active');
    if (btnDiceMenu) btnDiceMenu.classList.remove('active');
}

if(btnGeometryMenu && geometryPalette) {
    btnGeometryMenu.addEventListener('click', (e) => {
        const isOpen = geometryPalette.classList.contains('open');
        closeAllPanels();
        if (!isOpen) {
            geometryPalette.classList.add('open');
            btnGeometryMenu.classList.add('active');
        }
        e.stopPropagation();
    });
}

// --- Panel de Dados y Fichas ---
const btnAddDice = document.getElementById('btn-add-dice');
const btnAddToken = document.getElementById('btn-add-token');
const btnAddSquareToken = document.getElementById('btn-add-square-token');
const btnAddRectToken = document.getElementById('btn-add-rect-token');
const btnAddCoin = document.getElementById('btn-add-coin');

let creationOffsetCount = 0;
function getOffsetCoords(centerX, centerY) {
    const step = 25; // Píxeles de separación
    const maxSteps = 8;
    const offset = (creationOffsetCount % maxSteps) * step;
    creationOffsetCount++;
    return { x: centerX + offset, y: centerY + offset };
}

if (btnDiceMenu && diceTokenPalette) {
    btnDiceMenu.addEventListener('click', (e) => {
        const isOpen = diceTokenPalette.classList.contains('open');
        closeAllPanels();
        if (!isOpen) {
            diceTokenPalette.classList.add('open');
            btnDiceMenu.classList.add('active');
        }
        e.stopPropagation();
    });
}

if (btnAddDice) {
    btnAddDice.addEventListener('click', () => {
        const center = canvas.getVpCenter();
        const pos = getOffsetCoords(center.x, center.y);
        createDice(pos.x, pos.y);
    });
}

if (btnAddToken) {
    btnAddToken.addEventListener('click', () => {
        const center = canvas.getVpCenter();
        const pos = getOffsetCoords(center.x, center.y);
        createToken(pos.x, pos.y, 'circle');
    });
}

if (btnAddSquareToken) {
    btnAddSquareToken.addEventListener('click', () => {
        const center = canvas.getVpCenter();
        const pos = getOffsetCoords(center.x, center.y);
        createToken(pos.x, pos.y, 'square');
    });
}

if (btnAddRectToken) {
    btnAddRectToken.addEventListener('click', () => {
        const center = canvas.getVpCenter();
        const pos = getOffsetCoords(center.x, center.y);
        createToken(pos.x, pos.y, 'rect');
    });
}

if (btnAddCoin) {
    btnAddCoin.addEventListener('click', () => {
        const center = canvas.getVpCenter();
        const pos = getOffsetCoords(center.x, center.y);
        createCoin(pos.x, pos.y);
    });
}

function createCoin(left, top) {
    const size = 80;
    // Cara A: Animal (Águila/Emblema)
    const headsSVG = '<path d="M12 21.5c1.1 0 2-.9 2-2 0-1.1-.9-2-2-2s-2 .9-2 2c0 1.1.9 2 2 2zM2 20c0 .55.45 1 1 1h18c.55 0 1-.45 1-1v-2c0-2.21-1.79-4-4-4H7c-2.21 0-4 1.79-4 4v2zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>';
    
    const coinBody = new fabric.Circle({
        radius: size / 2,
        fill: '#e2e8f0', // Plateado claro
        stroke: '#475569', // Acero oscuro
        strokeWidth: 5,
        originX: 'center', originY: 'center',
        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 12, offsetX: 5, offsetY: 5 })
    });

    const innerRing = new fabric.Circle({
        radius: (size / 2) - 8,
        fill: 'transparent',
        stroke: '#94a3b8',
        strokeWidth: 2,
        strokeDashArray: [4, 4],
        originX: 'center', originY: 'center',
        selectable: false, evented: false
    });

    const tailsText = new fabric.Text('1', {
        fontSize: 34, fontWeight: 'bold', fill: '#1e293b',
        left: 0, top: 0, // Centrado relativo al grupo
        originX: 'center', originY: 'center', visible: false
    });

    // Emblema (Cara - Emoji divertido: guiño y lengua) centrado en 0,0
    const headsIcon = new fabric.Group([
        // Cara
        new fabric.Circle({ radius: 15, fill: 'transparent', stroke: '#1e293b', strokeWidth: 2, originX: 'center', originY: 'center' }),
        // Ojo izquierdo (Guiño)
        new fabric.Path('M -3 0 Q 0 -2 3 0', { fill: 'transparent', stroke: '#1e293b', strokeWidth: 2, originX: 'center', originY: 'center', left: -5, top: -4 }),
        // Ojo derecho (Abierto)
        new fabric.Circle({ radius: 2.5, fill: '#1e293b', left: 5, top: -4, originX: 'center', originY: 'center' }),
        // Boca abierta
        new fabric.Path('M -7 4 Q 0 6 7 4', { fill: 'transparent', stroke: '#1e293b', strokeWidth: 2, originX: 'center', originY: 'center' }),
        // Lengua (Rosa coral de la paleta)
        new fabric.Path('M -4 5 Q 0 15 4 5 Z', { fill: '#ef798a', stroke: '#1e293b', strokeWidth: 1.5, originX: 'center', originY: 'top', left: 1, top: 5 })
    ], {
        left: 0, top: 0,
        originX: 'center', originY: 'center', visible: true
    });

    const coin = new fabric.Group([coinBody, innerRing, tailsText, headsIcon], {
        left: left, top: top, originX: 'center', originY: 'center',
        selectable: true, hasControls: false, hasBorders: false,
        role: 'coin', name: 'coin', side: 'heads'
    });

    coin.flip = function() {
        let iteration = 0;
        const totalIterations = 15;
        const interval = setInterval(() => {
            const progress = iteration / totalIterations;
            // Efecto de giro sinusoidal
            const scaleY = Math.abs(Math.cos(iteration * 0.7));
            this.set('scaleY', Math.max(0.1, scaleY));
            
            // Cambiar lado en el punto de "canto" (escala mínima)
            if (scaleY < 0.2) {
                const isHeads = Math.random() > 0.5;
                headsIcon.visible = isHeads;
                tailsText.visible = !isHeads;
                this.side = isHeads ? 'heads' : 'tails';
            }
            
            canvas.requestRenderAll();
            iteration++;
            
            if (iteration >= totalIterations) {
                clearInterval(interval);
                this.set('scaleY', 1);
                // Resultado final aleatorio
                const isHeads = Math.random() > 0.5;
                headsIcon.visible = isHeads;
                tailsText.visible = !isHeads;
                this.side = isHeads ? 'heads' : 'tails';
                canvas.requestRenderAll();
                saveState();
            }
        }, 50);
    };

    let isDraggingCoin = false;
    let coinStartPos = { x: 0, y: 0 };

    coin.on('mousedown', () => {
        isDraggingCoin = false;
        coinStartPos = { x: coin.left, y: coin.top };
    });

    coin.on('moving', () => isDraggingCoin = true); 

    coin.on('mouseup', () => {
        const dist = Math.hypot(coin.left - coinStartPos.x, coin.top - coinStartPos.y);
        if (dist < 5 && !canvas.isPanningView) {
            coin.flip();
        }
    });

    canvas.add(coin);
    canvas.setActiveObject(coin);
    canvas.requestRenderAll();
    saveState();
}

function createToken(left, top, type = 'circle') {
    const size = 60;
    let shape;
    
    const commonProps = {
        fill: currentColor || '#2d3748',
        stroke: '#000000',
        strokeWidth: 3,
        left: left,
        top: top,
        originX: 'center',
        originY: 'center',
        selectable: true,
        hasControls: false,
        hasBorders: false,
        role: 'token',
        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.15)', blur: 8, offsetX: 3, offsetY: 3 })
    };

    if (type === 'circle') {
        shape = new fabric.Circle({
            ...commonProps,
            radius: size / 2,
            name: 'token-circle'
        });
    } else if (type === 'square') {
        shape = new fabric.Rect({
            ...commonProps,
            width: size,
            height: size,
            rx: 6,
            ry: 6,
            name: 'token-square'
        });
    } else if (type === 'rect') {
        shape = new fabric.Rect({
            ...commonProps,
            width: size * 1.5,
            height: size,
            rx: 6,
            ry: 6,
            name: 'token-rect'
        });
    }

    canvas.add(shape);
    canvas.setActiveObject(shape);
    canvas.requestRenderAll();
    saveState();
}

function createPlaceValueTable(left, top) {
    const cellSize = 40; // Tamaño exacto de la cuadrícula
    const groupWidth = cellSize * 12;
    const groupHeight = cellSize * 2;
    const objects = [];
    const strokeColor = '#2d3748'; // Gris oscuro de la paleta oficial

    const groupSpecs = [
        { label: 'MILES', color: '#7fb5ff' },    // Celeste Suave
        { label: 'MILLÓN', color: '#82d192' },   // Verde Suave
        { label: 'MIL', color: '#fadd75' },      // Amarillo Suave
        { label: 'UNIDAD', color: '#ef798a' }    // Rojo Suave / Coral
    ];

    groupSpecs.forEach((spec, gIndex) => {
        const xOffset = gIndex * cellSize * 3;

        // Celda superior (Título del grupo)
        const topRect = new fabric.Rect({
            left: xOffset - (groupWidth / 2) + (cellSize * 1.5),
            top: -(cellSize),
            width: cellSize * 3,
            height: cellSize,
            fill: spec.color,
            stroke: strokeColor,
            strokeWidth: 2,
            originX: 'center',
            originY: 'top'
        });
        
        const topText = new fabric.Text(spec.label, {
            left: xOffset - (groupWidth / 2) + (cellSize * 1.5),
            top: -(cellSize) + (cellSize / 2),
            fontSize: 14,
            fontWeight: 'bold',
            fontFamily: 'Inter',
            fill: strokeColor,
            originX: 'center',
            originY: 'center'
        });

        objects.push(topRect, topText);

        // Subceldas (C, D, U)
        const subLabels = ['C', 'D', 'U'];
        subLabels.forEach((label, sIndex) => {
            const sx = xOffset + (sIndex * cellSize);
            
            const subRect = new fabric.Rect({
                left: sx - (groupWidth / 2) + (cellSize / 2),
                top: 0,
                width: cellSize,
                height: cellSize,
                fill: spec.color,
                stroke: strokeColor,
                strokeWidth: 2,
                originX: 'center',
                originY: 'top'
            });

            const subText = new fabric.Text(label, {
                left: sx - (groupWidth / 2) + (cellSize / 2),
                top: (cellSize / 2),
                fontSize: 18,
                fontWeight: 'bold',
                fontFamily: 'Inter',
                fill: strokeColor,
                originX: 'center',
                originY: 'center'
            });

            objects.push(subRect, subText);
        });
    });

    const group = new fabric.Group(objects, {
        left: Math.round(left / cellSize) * cellSize,
        top: Math.round(top / cellSize) * cellSize,
        originX: 'center',
        originY: 'top',
        selectable: true,
        hasControls: true,
        lockRotation: true,
        lockScalingX: true,
        lockScalingY: true,
        name: 'place-value-table',
        role: 'math',
        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.1)', blur: 10, offsetX: 4, offsetY: 4 })
    });

    // Magnetismo (Snapping) al mover
    group.on('moving', function() {
        this.set({
            left: Math.round(this.left / cellSize) * cellSize,
            top: Math.round(this.top / cellSize) * cellSize
        });
    });

    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
    saveState();
}

// --- Plano Cartesiano ---
if (btnCartesian) {
    btnCartesian.addEventListener('click', () => {
        const center = canvas.getVpCenter();
        const snappedX = snapToGrid(center.x - 100);
        const snappedY = snapToGrid(center.y + 100);
        createCartesianQuadrant(snappedX, snappedY);
    });
}

function createCartesianQuadrant(left, top) {
    const grid = 40;
    const defaultUnits = 8;
    const OFFSET = 60;

    function buildObjects(unitsX, unitsY) {
        const objs = [];
        const colorX = '#7fb5ff'; // Celeste Suave de la paleta
        const colorY = '#ef798a'; // Rojo / Coral de la paleta
        const w = unitsX * grid;
        const h = unitsY * grid;

        // 1. Marco invisible
        objs.push(new fabric.Rect({
            left: 0, top: -h - OFFSET, width: w + OFFSET, height: h + OFFSET,
            fill: 'transparent', stroke: 'transparent', selectable: false
        }));

        const originX = OFFSET;
        const originY = -OFFSET;

        // 2. Ejes
        objs.push(new fabric.Line([originX, originY, originX + w, originY], { stroke: colorX, strokeWidth: 6, selectable: false }));
        objs.push(new fabric.Line([originX, originY, originX, originY - h], { stroke: colorY, strokeWidth: 6, selectable: false }));

        // 3. Marcas y Números
        for (let i = 1; i <= unitsX; i++) {
            const x = originX + (i * grid);
            objs.push(new fabric.Line([x, originY - 8, x, originY + 8], { stroke: colorX, strokeWidth: 2, selectable: false }));
            objs.push(new fabric.Text(i.toString(), {
                left: x, top: originY + 25, fontSize: 18, fontWeight: 'bold', fill: '#000000', originX: 'center', originY: 'center', selectable: false
            }));
        }
        for (let j = 1; j <= unitsY; j++) {
            const y = originY - (j * grid);
            objs.push(new fabric.Line([originX - 8, y, originX + 8, y], { stroke: colorY, strokeWidth: 2, selectable: false }));
            objs.push(new fabric.Text(j.toString(), {
                left: originX - 30, top: y, fontSize: 18, fontWeight: 'bold', fill: '#000000', originX: 'center', originY: 'center', selectable: false
            }));
        }

        objs.push(new fabric.Text('0', {
            left: originX - 18, top: originY + 18, fontSize: 18, fontWeight: 'bold', fill: '#000000', originX: 'center', originY: 'center', selectable: false
        }));

        return objs;
    }

    const group = new fabric.Group(buildObjects(defaultUnits, defaultUnits), {
        left: left - OFFSET,
        top: top + OFFSET,
        originX: 'left',
        originY: 'bottom',
        lockRotation: true,
        transparentCorners: false,
        cornerColor: '#6366f1',
        cornerSize: 24, // Aumentado para touch
        touchCornerSize: 40,
        hasRotatingPoint: false,
        name: 'planoCartesiano',
        unitsX: defaultUnits,
        unitsY: defaultUnits
    });

    group.setControlsVisibility({ mt: true, mr: true, ml: false, mb: false, bl: false, br: false, tl: false, tr: false });

    // La lógica de redimensionamiento ahora más robusta
    // Redimensionamiento real-time estable
    group.on('scaling', function(e) {
        // En lugar de escalar, detectamos la intención de alargamiento
        const transform = group.canvas._currentTransform;
        if (!transform) return;

        // Calculamos cuántas unidades DEBERÍA tener según la escala virtual de Fabric
        let newUnitsX = Math.round((group.width * group.scaleX - OFFSET) / grid);
        let newUnitsY = Math.round((group.height * group.scaleY - OFFSET) / grid);

        if (newUnitsX < 1) newUnitsX = 1;
        if (newUnitsY < 1) newUnitsY = 1;

        // Solo actuamos si ha cambiado la cantidad de unidades (paso de cuadro)
        if (newUnitsX !== group.unitsX || newUnitsY !== group.unitsY) {
            // Capturamos el punto del vértice (0,0) actual para anclarlo
            const vX = group.left + (OFFSET * group.scaleX);
            const vY = group.top - (OFFSET * group.scaleY);

            group.unitsX = newUnitsX;
            group.unitsY = newUnitsY;

            // Bloqueamos el escalado visual reseteando a 1.0 inmediatamente
            group.set({ scaleX: 1, scaleY: 1 });

            // Regeneramos el contenido interno
            const objects = buildObjects(group.unitsX, group.unitsY);
            group._objects = []; 
            objects.forEach(o => group.add(o));
            
            // Forzamos actualización de límites SIN centrar objetos
            group.addWithUpdate();

            // Re-anclamos el vértice a su posición original
            group.set({
                left: vX - OFFSET,
                top: vY + OFFSET
            });
        } else {
            // Si no ha cambiado la unidad, forzamos escala 1 para evitar ver el "estiramiento"
            group.set({ scaleX: 1, scaleY: 1 });
        }
        
        canvas.requestRenderAll();
    });

    group.on('moving', function() {
        var vX = group.left + OFFSET;
        var vY = group.top - OFFSET;
        var sX = snapToGrid(vX);
        var sY = snapToGrid(vY);
        group.set({
            left: sX - OFFSET,
            top: sY + OFFSET
        });
    });

    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
    saveState();
}

if(btnRulesMenu && rulesPalette) {
    btnRulesMenu.addEventListener('click', (e) => {
        const isOpen = rulesPalette.classList.contains('open');
        closeAllPanels();
        if (!isOpen) {
            rulesPalette.classList.add('open');
            btnRulesMenu.classList.add('active');
        }
        e.stopPropagation();
    });
}

// Re-vincular eventos para los swatches (ahora en el side panel)
function bindPaletteEvents() {
    swatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            swatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            
            currentColor = swatch.getAttribute('data-color');
            canvas.freeDrawingBrush.color = currentColor;
            
            // Actualizar color de objetos seleccionados
            const activeObjects = canvas.getActiveObjects();
            if (activeObjects.length) {
                activeObjects.forEach(obj => {
                    if (obj.type === 'path') {
                        obj.set({ stroke: currentColor });
                    } else if (obj.angleId) {
                        canvas.getObjects().forEach(o => {
                            if (o.angleId === obj.angleId) {
                                if (o.type === 'line' || o.type === 'angleArc') o.set({ stroke: currentColor });
                                if (o.type === 'circle' || o.type === 'text') o.set({ fill: currentColor });
                            }
                        });
                    } else if (obj.lineId) {
                        canvas.getObjects().forEach(o => {
                            if (o.lineId === obj.lineId) {
                                if (o.type === 'line') o.set({ stroke: currentColor });
                                if (o.type === 'circle') o.set({ fill: currentColor });
                            }
                        });
                    } else {
                        // Para texto y fichas usamos fill, para el resto stroke
                        if (obj.type === 'text' || obj.type === 'i-text' || obj.role === 'token') {
                            obj.set({ fill: currentColor });
                        } else {
                            obj.set({ stroke: currentColor });
                        }
                    }
                });
                canvas.requestRenderAll();
                saveState();
            }
        });
    });

    function updateBrush() {
        const val = parseInt(strokeWidthSlider.value);
        canvas.freeDrawingBrush.width = val;
        if (strokeWidthLabel) strokeWidthLabel.textContent = val;
        
        // También actualizar objetos seleccionados si los hay
        const activeObjects = canvas.getActiveObjects();
        if (activeObjects.length) {
            activeObjects.forEach(obj => {
                if (obj.strokeWidth !== undefined) {
                    obj.set({ strokeWidth: val });
                }
            });
            canvas.requestRenderAll();
            saveState();
        }
    }

    strokeWidthSlider.addEventListener('input', updateBrush);

    if (btnStrokeUp) {
        btnStrokeUp.addEventListener('click', () => {
            let val = parseInt(strokeWidthSlider.value);
            if (val < 50) {
                val++;
                strokeWidthSlider.value = val;
                updateBrush();
            }
        });
    }

    if (btnStrokeDown) {
        btnStrokeDown.addEventListener('click', () => {
            let val = parseInt(strokeWidthSlider.value);
            if (val > 1) {
                val--;
                strokeWidthSlider.value = val;
                updateBrush();
            }
        });
    }
}

bindPaletteEvents();

// Menús desplegables (Touch & Click) - Solo para otros menús restantes si existen
document.querySelectorAll('.dropbtn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const dropup = btn.closest('.dropup');
        const isOpen = dropup.classList.contains('open');

        // Close others
        document.querySelectorAll('.dropup').forEach(d => {
            if (d !== dropup) d.classList.remove('open');
        });

        // Toggle self
        if (!isOpen) {
            dropup.classList.add('open');
        } else {
            // Only close if we're clicking directly on the button to toggle it
            // but for bg-grid we also have the secondary action of the grid toggle itself.
            dropup.classList.remove('open');
        }
        
        // Evitar que el clic se propague al canvas si es un menú
        // Pero no detenemos para btn-grid ya que ese tiene listener propio
        if (btn.id !== 'btn-grid') {
            e.stopPropagation();
        }
    });
});

// Cerrar menús al hacer clic fuera
window.addEventListener('click', (e) => {
    if (!e.target.closest('.dropup')) {
        document.querySelectorAll('.dropup').forEach(d => d.classList.remove('open'));
    }
}, true); // Use capture phase to ensure it runs

// Custom Polygon Tool
btnCustomPolygon.addEventListener('click', () => {
    canvas.isDrawingMode = false;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setActiveTool(btnCustomPolygon);
    document.querySelector('.canvas-container-wrapper').style.cursor = 'crosshair';
});

// Color Swatches Logic (Moved to bindPaletteEvents)
// (Legacy code removed)

const AngleArcVisual = fabric.util.createClass(fabric.Object, {
    type: 'angleArc',
    initialize: function(options) {
        this.callSuper('initialize', options);
        this.pA = options.pA;
        this.pB = options.pB;
        this.pC = options.pC;
        this.radius = options.radius || 35;
    },
    _render: function(ctx) {
        let angle1 = Math.atan2(this.pC.top - this.pB.top, this.pC.left - this.pB.left);
        let angle2 = Math.atan2(this.pA.top - this.pB.top, this.pA.left - this.pB.left);
        
        let diff = angle2 - angle1;
        if (diff < 0) diff += Math.PI * 2;
        
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, angle1, angle1 + diff, false);
        ctx.strokeStyle = this.stroke;
        ctx.lineWidth = 2; 
        ctx.stroke();
    }
});

function updateAngleLabel(textObj, pA, pB, pC, radius) {
    let angle1 = Math.atan2(pC.top - pB.top, pC.left - pB.left);
    let angle2 = Math.atan2(pA.top - pB.top, pA.left - pB.left);
    
    let diff = angle2 - angle1;
    if (diff < 0) diff += Math.PI * 2;
    
    let degrees = diff * 180 / Math.PI;
    textObj.set({ text: Math.round(degrees) + '°' });
    
    // Bisectriz para colocar el texto en el medio del arco
    let bisector = angle1 + diff / 2;
    let dist = radius + 26; 
    
    textObj.set({
        left: pB.left + dist * Math.cos(bisector),
        top: pB.top + dist * Math.sin(bisector)
    });
    textObj.setCoords();
}

function createInteractiveAngle(pts, color, width, angleId) {
    const lineOpts = {
        stroke: color, strokeWidth: width,
        selectable: false, evented: false, 
        originX: 'center', originY: 'center'
    };
    
    const line1 = new fabric.Line([pts[0].x, pts[0].y, pts[1].x, pts[1].y], lineOpts);
    const line2 = new fabric.Line([pts[1].x, pts[1].y, pts[2].x, pts[2].y], lineOpts);
    
    const circleA = new fabric.Circle({
        radius: Math.max(width * 1.5, 12), fill: color, left: pts[0].x, top: pts[0].y,
        originX: 'center', originY: 'center', hasBorders: false, hasControls: false, hoverCursor: 'pointer',
        padding: 10
    });
    
    const circleB = new fabric.Circle({
        radius: Math.max(width * 2, 16), fill: '#ffffff', stroke: color, strokeWidth: Math.max(3, width / 2),
        left: pts[1].x, top: pts[1].y,
        originX: 'center', originY: 'center', hasBorders: false, hasControls: false,
        hoverCursor: 'move',
        padding: 10
    });
    
    const circleC = new fabric.Circle({
        radius: Math.max(width * 1.5, 12), fill: color, left: pts[2].x, top: pts[2].y,
        originX: 'center', originY: 'center', hasBorders: false, hasControls: false, hoverCursor: 'pointer',
        padding: 10
    });
    
    const angleParts = [line1, line2, circleA, circleB, circleC];
    
    const arc = new AngleArcVisual({
        pA: circleA, pB: circleB, pC: circleC,
        left: pts[1].x, top: pts[1].y,
        originX: 'center', originY: 'center',
        selectable: false, evented: false,
        stroke: color, fill: 'transparent'
    });
    angleParts.push(arc);
    
    const angleText = new fabric.Text('', {
        fontSize: 24, fill: color, fontWeight: '400', fontFamily: "'Patrick Hand', cursive",
        originX: 'center', originY: 'center', selectable: false, evented: false
    });
    angleParts.push(angleText);
    
    updateAngleLabel(angleText, circleA, circleB, circleC, 35);
    
    circleA.on('moving', function() {
        line1.set({ x1: circleA.left, y1: circleA.top });
        arc.dirty = true;
        updateAngleLabel(angleText, circleA, circleB, circleC, 35);
    });
    
    circleC.on('moving', function() {
        line2.set({ x2: circleC.left, y2: circleC.top });
        arc.dirty = true;
        updateAngleLabel(angleText, circleA, circleB, circleC, 35);
    });
    
    let lastLeft = circleB.left;
    let lastTop = circleB.top;
    
    circleB.on('mousedown', function() {
        lastLeft = circleB.left;
        lastTop = circleB.top;
    });
    
    circleB.on('moving', function() {
        let dx = circleB.left - lastLeft;
        let dy = circleB.top - lastTop;
        
        circleA.set({ left: circleA.left + dx, top: circleA.top + dy }).setCoords();
        circleC.set({ left: circleC.left + dx, top: circleC.top + dy }).setCoords();
        
        line1.set({ x1: circleA.left, y1: circleA.top, x2: circleB.left, y2: circleB.top });
        line2.set({ x1: circleB.left, y1: circleB.top, x2: circleC.left, y2: circleC.top });
        
        arc.set({ left: circleB.left, top: circleB.top });
        arc.dirty = true;
        updateAngleLabel(angleText, circleA, circleB, circleC, 35);
        
        lastLeft = circleB.left;
        lastTop = circleB.top;
    });
    
    angleParts.forEach(obj => {
        obj.angleId = angleId;
        obj.on('removed', () => {
            canvas.getObjects().forEach(o => {
                if (o.angleId === angleId && o !== obj) canvas.remove(o);
            });
        });
        canvas.add(obj);
    });
    canvas.requestRenderAll();
}

function createInteractiveLine(p1, p2, color, width, lineId) {
    const line = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
        stroke: color,
        strokeWidth: width,
        selectable: true,
        hasBorders: false,
        hasControls: false,
        perPixelTargetFind: true,
        targetFindTolerance: 25, // Aumentado para facilitar selección touch
        strokeLineCap: 'round',
        lineId: lineId,
        strokeUniform: true,
        selectionBackgroundColor: 'transparent',
    });

    // Desactivar rotación para mantener la simplicidad
    line.setControlsVisibility({ mtr: false });

    canvas.add(line);
    canvas.requestRenderAll();
}

function createInteractiveArrow(p1, p2, color, width) {
    // Si los puntos son iguales, no creamos nada
    if (p1.x === p2.x && p1.y === p2.y) return;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx*dx + dy*dy);
    
    const headHeight = width * 2.5 + 10; // Altura de la punta
    
    // Acortamos la línea para que termine dentro de la base del triángulo
    // y no sobresalga por la punta.
    const lineEndX = p1.x + Math.max(0, length - headHeight * 0.5) * Math.cos(angle);
    const lineEndY = p1.y + Math.max(0, length - headHeight * 0.5) * Math.sin(angle);
    
    const line = new fabric.Line([p1.x, p1.y, lineEndX, lineEndY], {
        stroke: color,
        strokeWidth: width,
        strokeLineCap: 'round',
        selectable: false
    });
    
    const triangle = new fabric.Triangle({
        left: p2.x,
        top: p2.y,
        originX: 'center',
        originY: 'top', 
        angle: angle * 180 / Math.PI + 90,
        width: headHeight * 1.2, // Un poco más ancha que larga para mejor estética
        height: headHeight,
        fill: color,
        selectable: false
    });
    
    const group = new fabric.Group([line, triangle], {
        selectable: true,
        hasBorders: false,
        hasControls: true,
        strokeUniform: true,
        cornerSize: 24,
        touchCornerSize: 40
    });
    
    // Desactivar controles que no tienen sentido para una flecha simple si se prefiere
    group.setControlsVisibility({ mtr: false });

    canvas.add(group);
    canvas.requestRenderAll();
    saveState();
}

// Eventos de ratón
canvas.on('mouse:down', (e) => {
    isMouseDown = true;
    
    // Si la herramienta activa es la mano (Move), activamos el paneo siempre
    if (currentActiveTool === btnMove) {
        canvas.isPanningView = true;
        const evt = e.e;
        const pointerObj = (evt.touches && evt.touches[0]) ? evt.touches[0] : evt;
        canvas.lastPosX = pointerObj.clientX;
        canvas.lastPosY = pointerObj.clientY;
        return; 
    }

    if (isErasing && e.target) {
        canvas.remove(e.target);
        return;
    }

    if ((isDrawingLine || isDrawingArrow) && !isMouseDown) { // Guard for secondary clicks
        return;
    }

    if (isDrawingLine || isDrawingArrow) {
        const pointer = canvas.getPointer(e.e);
        const snappedX = snapToGrid(pointer.x);
        const snappedY = snapToGrid(pointer.y);
        lineTempPts = [{x: snappedX, y: snappedY}];
        activeLineId = Date.now();
        
        activeLine = new fabric.Line([snappedX, snappedY, snappedX, snappedY], {
            stroke: currentColor,
            strokeWidth: parseInt(strokeWidthSlider.value, 10),
            selectable: false,
            evented: false,
            strokeLineCap: 'round',
            selectionBackgroundColor: 'transparent'
        });
        canvas.add(activeLine);
        return;
    }

    if (isDrawingAngle) {
        const pointer = canvas.getPointer(e.e);
        
        if (anglePhase === 0) {
            cancelAngleDrawing(); // Clean leftovers
            isDrawingAngle = true; // reactivate 
            activeAngleId = Date.now();
            angleTempPts.push({x: pointer.x, y: pointer.y});
            
            const c1 = new fabric.Circle({
                radius: 8, fill: currentColor, left: pointer.x, top: pointer.y,
                originX: 'center', originY: 'center', selectable: false, evented: false
            });
            angleTempCircles.push(c1);
            canvas.add(c1);
            
            const line1 = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
                stroke: currentColor, strokeWidth: parseInt(strokeWidthSlider.value, 10), selectable: false, evented: false
            });
            angleTempLines.push(line1);
            canvas.add(line1);
            anglePhase = 1;

        } else if (anglePhase === 1) {
            angleTempPts.push({x: pointer.x, y: pointer.y});
            
            const c2 = new fabric.Circle({
                radius: 10, fill: '#ffffff', stroke: currentColor, strokeWidth: 3,
                left: pointer.x, top: pointer.y, originX: 'center', originY: 'center', selectable: false, evented: false
            });
            angleTempCircles.push(c2);
            canvas.add(c2);
            
            angleTempLines[0].set({ x2: pointer.x, y2: pointer.y });
            
            const line2 = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
                stroke: currentColor, strokeWidth: parseInt(strokeWidthSlider.value, 10), selectable: false, evented: false
            });
            angleTempLines.push(line2);
            canvas.add(line2);
            anglePhase = 2;

        } else if (anglePhase === 2) {
            angleTempPts.push({x: pointer.x, y: pointer.y});
            
            angleTempLines[1].set({ x2: pointer.x, y2: pointer.y });
            
            // Puntos capturados: [p0, vertex, p2]
            const a0 = Math.atan2(angleTempPts[0].y - angleTempPts[1].y, angleTempPts[0].x - angleTempPts[1].x);
            const a2 = Math.atan2(angleTempPts[2].y - angleTempPts[1].y, angleTempPts[2].x - angleTempPts[1].x);
            
            // La etiqueta usa CCW desde p2 hacia p0
            let sweep = a0 - a2;
            if (sweep < 0) sweep += Math.PI * 2;
            
            if (sweep > Math.PI) {
                // Si el barrido actual (P2 -> P0) es > 180, el barrido inverso es el menor.
                // Intercambiamos p0 y p2.
                const temp = angleTempPts[0];
                angleTempPts[0] = angleTempPts[2];
                angleTempPts[2] = temp;
            }
            
            createInteractiveAngle(
                angleTempPts, 
                currentColor, 
                parseInt(strokeWidthSlider.value, 10), 
                activeAngleId
            );
            
            angleTempLines.forEach(l => canvas.remove(l));
            angleTempCircles.forEach(c => canvas.remove(c));
            anglePhase = 0;
            angleTempPts = [];
            angleTempLines = [];
            angleTempCircles = [];
            setActiveTool(btnSelect);
        }
        return;
    }

    if (isDrawingPolygon) {
        const rawPointer = canvas.getPointer(e.e);
        const pointer = { x: snapToGrid(rawPointer.x), y: snapToGrid(rawPointer.y) };

        // Check if closing polygon (clicking near first point)
        if (pointArray.length > 2) {
            const firstPoint = pointArray[0];
            const dist = Math.hypot(pointer.x - firstPoint.x, pointer.y - firstPoint.y);
            if (dist < 15) {
                // Eliminar líneas base y círculos constructores
                if (activeLine) canvas.remove(activeLine);
                lineArray.forEach(l => canvas.remove(l));
                pointCircles.forEach(c => canvas.remove(c));

                // Fabric.js puede pedir correcciones en left/top, 
                // pero si entregamos la lista de puntos exactos y un bounding origin exacto funciona:
                const poly = new fabric.Polygon(pointArray, {
                    ...getDefaultShapeStyle()
                });
                
                canvas.add(poly);
                
                pointArray = [];
                lineArray = [];
                pointCircles = [];
                activeLine = null;
                
                setActiveTool(btnSelect);
                canvas.setActiveObject(poly);
                return;
            }
        }

        // Add visual vertex circle
        const circle = new fabric.Circle({
            radius: 5,
            fill: currentColor,
            stroke: '#ffffff',
            strokeWidth: 2,
            left: pointer.x,
            top: pointer.y,
            originX: 'center',
            originY: 'center',
            selectable: false,
            evented: false
        });
        pointCircles.push(circle);
        canvas.add(circle);

        pointArray.push({ x: pointer.x, y: pointer.y });
        
        // Finalize previous line
        if (activeLine) {
            activeLine.set({ x2: pointer.x, y2: pointer.y });
            activeLine.setCoords();
        }
        
        // Empezar nueva preview line
        activeLine = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            strokeWidth: parseInt(strokeWidthSlider.value, 10),
            fill: currentColor,
            stroke: currentColor,
            selectable: false,
            evented: false
        });
        lineArray.push(activeLine);
        canvas.add(activeLine);
    }
});

canvas.on('mouse:move', (e) => {
    lastMouseEvent = e;
    
    if (canvas.isPanningView) {
        const evt = e.e;
        const pointerObj = (evt.touches && evt.touches[0]) ? evt.touches[0] : evt;
        
        const vpt = canvas.viewportTransform;
        vpt[4] += pointerObj.clientX - canvas.lastPosX;
        vpt[5] += pointerObj.clientY - canvas.lastPosY;
        
        // Renderizado eficiente
        canvas.requestRenderAll();
        
        canvas.lastPosX = pointerObj.clientX;
        canvas.lastPosY = pointerObj.clientY;
        
        // El fondo se actualiza solo si es necesario
        if (window.updateGridBackground) window.updateGridBackground();
        return;
    }

    if (isMouseDown && isErasing && e.target) {
        canvas.remove(e.target);
    }

    if ((isDrawingLine || isDrawingArrow) && isMouseDown && activeLine) {
        const pointer = canvas.getPointer(e.e);
        activeLine.set({ x2: snapToGrid(pointer.x), y2: snapToGrid(pointer.y) });
        canvas.requestRenderAll();
    }

    if (isDrawingAngle) {
        const pointer = canvas.getPointer(e.e);
        if (anglePhase === 1) {
            angleTempLines[0].set({ x2: pointer.x, y2: pointer.y });
            canvas.requestRenderAll();
        } else if (anglePhase === 2) {
            angleTempLines[1].set({ x2: pointer.x, y2: pointer.y });
            canvas.requestRenderAll();
        }
    }

    if (isDrawingPolygon && activeLine && activeLine.type === 'line') {
        const rawPointer = canvas.getPointer(e.e);
        activeLine.set({ x2: snapToGrid(rawPointer.x), y2: snapToGrid(rawPointer.y) });
        canvas.requestRenderAll();
    }
});

canvas.on('mouse:up', () => {
    if (canvas.isPanningView) {
        canvas.isPanningView = false;
        // Solo restauramos 'selection = true' si NO estamos en la herramienta de mover pano exclusiva
        if (currentActiveTool !== btnMove) {
            canvas.selection = true;
        }
        canvas.requestRenderAll();
    }

    if ((isDrawingLine || isDrawingArrow) && activeLine) {
        const pointer = canvas.getPointer(lastMouseEvent.e);
        const snappedEnd = { x: snapToGrid(pointer.x), y: snapToGrid(pointer.y) };
        lineTempPts.push(snappedEnd);
        
        canvas.remove(activeLine);
        
        if (isDrawingArrow) {
            createInteractiveArrow(
                lineTempPts[0], 
                lineTempPts[1], 
                currentColor, 
                parseInt(strokeWidthSlider.value, 10)
            );
        } else {
            createInteractiveLine(
                lineTempPts[0], 
                lineTempPts[1], 
                currentColor, 
                parseInt(strokeWidthSlider.value, 10), 
                activeLineId
            );
        }
        
        activeLine = null;
        lineTempPts = [];
        canvas.discardActiveObject().requestRenderAll();
    }
    isMouseDown = false;
});

canvas.on('mouse:wheel', function(opt) {
    var delta = opt.e.deltaY;
    var zoom = canvas.getZoom();
    // Sensibilidad muy fina: 1.02 para máxima precisión académica
    if (delta > 0) {
        zoom *= 0.98;
    } else {
        zoom *= 1.02;
    }
    
    if (zoom > 5) zoom = 5;
    if (zoom < 0.2) zoom = 0.2;
    canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
    if (window.updateGridBackground) window.updateGridBackground();
    opt.e.preventDefault();
    opt.e.stopPropagation();
});

// Pinch to zoom support
let initialPinchDistance = null;
let initialZoom = 1;

canvas.upperCanvasEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        initialPinchDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        initialZoom = canvas.getZoom();
    }
});

canvas.upperCanvasEl.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && initialPinchDistance) {
        e.preventDefault();
        const currentDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        const touchZoom = currentDistance / initialPinchDistance;
        let finalZoom = initialZoom * touchZoom;
        if (finalZoom > 5) finalZoom = 5;
        if (finalZoom < 0.2) finalZoom = 0.2;
        
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        
        canvas.zoomToPoint({ x: centerX, y: centerY }, finalZoom);
        if (window.updateGridBackground) window.updateGridBackground();
    }
}, { passive: false });

canvas.upperCanvasEl.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
        initialPinchDistance = null;
    }
});

// Recognition logic removed

// Borrar toda la pizarra
btnDelete.addEventListener('click', () => {
    if (confirm("¿Estás seguro de que quieres borrar TODA la pizarra?")) {
        const objects = canvas.getObjects();
        objects.forEach(obj => canvas.remove(obj));
        canvas.discardActiveObject();
        canvas.requestRenderAll();

        // Return to select tool after clearing
        canvas.isDrawingMode = false;
        setActiveTool(btnSelect);
    }
});

// Global Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (isDrawingPolygon) {
            cancelCustomPolygon();
            setActiveTool(btnSelect);
        }
        if (isDrawingAngle) {
            cancelAngleDrawing();
            setActiveTool(btnSelect);
        }
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeObjects = canvas.getActiveObjects();
        // Skip default behavior if focus is on input element
        if (document.activeElement.tagName === 'INPUT') return;
        
        if (activeObjects.length) {
            e.preventDefault();
            canvas.discardActiveObject();
            activeObjects.forEach(obj => {
                canvas.remove(obj);
            });
            saveState(); // Guardar tras borrar
        }
    }

    // Atajos Undo/Redo
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
            e.preventDefault();
            undo();
        }
        if (e.key === 'y') {
            e.preventDefault();
            redo();
        }
    }
});

// Brush and Colors Handlers (Moved to bindPaletteEvents)
// (Legacy code removed)

// Shapes Functionality
// Set generic properties for all inserted shapes
function getDefaultShapeStyle() {
    return {
        fill: 'transparent',
        stroke: currentColor,
        strokeWidth: parseInt(strokeWidthSlider.value, 10),
        strokeUniform: true
    };
}

function processNewShape(shape) {
    canvas.isDrawingMode = false;
    canvas.add(shape);
    canvas.centerObject(shape);
    
    if (isGridActive) {
        shape.set({
            left: snapToGrid(shape.left),
            top: snapToGrid(shape.top)
        });
        shape.setCoords();
    }
    
    // No seleccionamos automáticamente para evitar cambios de color accidentales
    setActiveTool(btnSelect);
}

document.getElementById('btn-square').addEventListener('click', () => {
    const square = new fabric.Rect({
        ...getDefaultShapeStyle(),
        width: 120,
        height: 120
    });
    processNewShape(square);
});

document.getElementById('btn-rect').addEventListener('click', () => {
    const rect = new fabric.Rect({
        ...getDefaultShapeStyle(),
        width: 160,
        height: 120
    });
    processNewShape(rect);
});

document.getElementById('btn-circle').addEventListener('click', () => {
    const circle = new fabric.Circle({
        ...getDefaultShapeStyle(),
        radius: 60
    });
    processNewShape(circle);
});

document.getElementById('btn-triangle').addEventListener('click', () => {
    const triangle = new fabric.Triangle({
        ...getDefaultShapeStyle(),
        width: 120,
        height: 120
    });
    processNewShape(triangle);
});

// Polygon Handling
if (btnSidesUp && btnSidesDown && sidesValueDisplay) {
    btnSidesUp.addEventListener('click', () => {
        if (currentPolygonSides < 20) {
            currentPolygonSides++;
            sidesValueDisplay.textContent = currentPolygonSides;
        }
    });

    btnSidesDown.addEventListener('click', () => {
        if (currentPolygonSides > 3) {
            currentPolygonSides--;
            sidesValueDisplay.textContent = currentPolygonSides;
        }
    });
}

document.getElementById('btn-polygon').addEventListener('click', () => {
    createPolygon();
});

function createPolygon() {
    let sides = currentPolygonSides;

    const radius = 60; // Circle radius 60 gives bounding dimension roughly 120
    const points = [];
    const angle = (Math.PI * 2) / sides;
    const offset = -Math.PI / 2; // Point upwards

    for (let i = 0; i < sides; i++) {
        points.push({ x: radius * Math.cos(i * angle + offset), y: radius * Math.sin(i * angle + offset) });
    }

    const polygon = new fabric.Polygon(points, {
        ...getDefaultShapeStyle()
    });
    
    // Polygons don't bound themselves symmetrically sometimes, so we center it and then snap it.
    processNewShape(polygon);
}

// Grid background handling
const prefGridToggle = document.getElementById('pref-grid-toggle');
let isGridActive = true;

if (prefGridToggle) {
    prefGridToggle.addEventListener('change', (e) => {
        isGridActive = e.target.checked;
        applyGridState();
        saveSettings();
    });
}

function applyGridState() {
    const cp = document.querySelector('.canvas-panel');
    if (!cp) return;
    if (isGridActive) {
        cp.classList.add('show-grid');
        updateGridSize();
    } else {
        cp.classList.remove('show-grid');
    }
}


// Grid size slider references removed

function saveSettings() {
    const settings = {
        gridActive: isGridActive,
        toolbarHidden: toolbar.classList.contains('hidden')
    };
    localStorage.setItem('pizarraSettings', JSON.stringify(settings));
}

function loadSettings() {
    const saved = localStorage.getItem('pizarraSettings');
    try {
        if (saved) {
            const settings = JSON.parse(saved);
            isGridActive = settings.gridActive !== undefined ? settings.gridActive : true;
            
            if (settings.toolbarHidden) {
                toolbar.classList.add('hidden');
            } else {
                toolbar.classList.remove('hidden');
            }
        } else {
            isGridActive = true; // Default
        }
        
        // Aplicar estado
        applyGridState();
        if (prefGridToggle) prefGridToggle.checked = isGridActive;
    } catch (e) {
        console.error("Error cargando configuración:", e);
    }
}


let lastZoomForGrid = -1;
window.updateGridBackground = function() {
    if (!isGridActive) return;
    
    // Solo usamos requestAnimationFrame para coordinar con el refresco de pantalla
    window.requestAnimationFrame(() => {
        const gridLayer = document.getElementById('grid-layer');
        if (!gridLayer) return;

        const zoom = canvas.getZoom();
        const vpt = canvas.viewportTransform;
        
        // 1. MOVIMIENTO GPU (Súper suave): Solo transformamos
        gridLayer.style.willChange = 'transform';
        gridLayer.style.transformOrigin = '0 0';
        gridLayer.style.transform = `translate3d(${vpt[4]}px, ${vpt[5]}px, 0) scale(${zoom})`;
        gridLayer.style.backfaceVisibility = 'hidden';
        gridLayer.style.perspective = '1000';
        
        // 2. CORRECCIÓN DE GROSOR (Throttled): Solo si el zoom cambió significativamente
        // Esto evita repaints costosos durante el paneo simple.
        if (Math.abs(zoom - lastZoomForGrid) > 0.005) {
            gridLayer.style.setProperty('--grid-stroke', (2 / zoom) + 'px');
            lastZoomForGrid = zoom;
        }
    });
};

function updateGridSize() {
    window.updateGridBackground();
}

function snapToGrid(value) {
    if (!isGridActive) return value;
    const size = 40; // Hardcoded default gridSize
    return Math.round(value / size) * size;
}

canvas.on('object:moving', (e) => {
    if (!isGridActive) return;
    const obj = e.target;
    if (obj.angleId) return; // Libre de magnetismo para la herramienta de ángulo
    
    // Cuerpos geométricos y líneas
    if (['rect', 'circle', 'triangle', 'polygon', 'line'].includes(obj.type)) {
        obj.set({
            left: snapToGrid(obj.left),
            top: snapToGrid(obj.top)
        });
    }
});

canvas.on('object:scaling', (e) => {
    if (!isGridActive) return;
    const obj = e.target;
    if (obj.angleId) return; // Libre de magnetismo para la herramienta de ángulo
    
    if (['rect', 'circle', 'triangle', 'polygon', 'line'].includes(obj.type)) {
        let scaledWidth = obj.width * obj.scaleX;
        let scaledHeight = obj.height * obj.scaleY;
        
        let desiredWidth = snapToGrid(scaledWidth);
        let desiredHeight = snapToGrid(scaledHeight);
        
        // Prevent scaling down to zero
        if (desiredWidth === 0) desiredWidth = 40;
        if (desiredHeight === 0) desiredHeight = 40;
        
        obj.set({
            scaleX: desiredWidth / obj.width,
            scaleY: desiredHeight / obj.height
        });
    }
});

canvas.on('object:modified', (e) => {
    if (!isGridActive) return;
    const obj = e.target;
    if (obj.angleId) return; // Libre de magnetismo
    
    if (['rect', 'circle', 'triangle', 'polygon', 'line'].includes(obj.type)) {
        obj.set({
            left: snapToGrid(obj.left),
            top: snapToGrid(obj.top)
        });
        obj.setCoords();
    }
    saveState();
});

// Fullscreen Handling
btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Status de error al completar pantalla full: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
});

// Update icon when fullscreen state changes (e.g., using "Esc" key)
document.addEventListener('fullscreenchange', () => {
    const icon = btnFullscreen.querySelector('i');
    if (document.fullscreenElement) {
        icon.classList.replace('bx-fullscreen', 'bx-exit-fullscreen');
        btnFullscreen.title = 'Salir de Pantalla Completa';
    } else {
        icon.classList.replace('bx-exit-fullscreen', 'bx-fullscreen');
        btnFullscreen.title = 'Pantalla Completa';
    }
});

// Enhanced UX - Customizing object selection styles globally - Optimized for TOUCH
fabric.Object.prototype.set({
    transparentCorners: false,
    cornerColor: '#ffffff',
    cornerStrokeColor: '#6366f1',
    borderColor: '#6366f1',
    cornerSize: 18, // Aumentado para mejor uso en pantallas touch
    touchCornerSize: 32, // Propiedad específica de Fabric para área de toque
    padding: 12, // Más espacio para no tapar el objeto
    cornerStyle: 'circle',
    selectionBackgroundColor: 'transparent'
});

// --- Lógica de la Fecha ---
function updateDateDisplay() {
    const dateSpan = document.getElementById('current-date');
    if (!dateSpan) return;
    
    const now = new Date();
    
    // Formato: Miércoles, 8 de Abril de 2026
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);
    
    // Capitalizar primera letra
    dateSpan.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
}

document.getElementById('btn-toggle-date').addEventListener('click', (e) => {
    const widget = document.getElementById('date-widget');
    const btn = document.getElementById('btn-toggle-date');
    const isHidden = widget.style.display === 'none';
    
    if (isHidden) {
        widget.style.display = 'flex';
        btn.classList.add('active');
    } else {
        widget.style.display = 'none';
        btn.classList.remove('active');
    }
});

// --- Lógica del Calendario Mensual ---
let calendarDate = new Date();

function renderCalendar() {
    const monthYear = document.getElementById('calendar-month-year');
    const daysGrid = document.getElementById('calendar-days');
    if (!monthYear || !daysGrid) return;

    daysGrid.innerHTML = '';
    
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    
    // Titulo Mes Año
    const options = { month: 'long', year: 'numeric' };
    monthYear.textContent = calendarDate.toLocaleDateString('es-ES', options);
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    // Rellenar días vacíos al inicio
    for (let i = 0; i < firstDay; i++) {
        const emptyDiv = document.createElement('div');
        emptyDiv.classList.add('calendar-day', 'empty');
        daysGrid.appendChild(emptyDiv);
    }
    
    // Generar días del mes
    for (let day = 1; day <= daysInMonth; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.classList.add('calendar-day');
        dayDiv.textContent = day;
        if (isCurrentMonth && today.getDate() === day) {
            dayDiv.classList.add('today');
        }
        daysGrid.appendChild(dayDiv);
    }
}

document.getElementById('btn-toggle-clock').addEventListener('click', () => {
    const clock = document.getElementById('clock-widget');
    const btn = document.getElementById('btn-toggle-clock');
    const isHidden = clock.style.display === 'none';
    
    if (isHidden) {
        clock.style.display = 'flex';
        btn.classList.add('active');
        updateClock();
    } else {
        clock.style.display = 'none';
        btn.classList.remove('active');
    }
});

let isAnalogMode = false; // Mantenemos variable por ahora pero la lógica se simplifica

function updateClock() {
    const clockWidget = document.getElementById('clock-widget');
    if (clockWidget.style.display === 'none') return;

    const now = new Date();
    const digitalClock = document.getElementById('digital-clock');
    if (digitalClock) {
        digitalClock.textContent = now.toLocaleTimeString('es-ES', { hour12: false });
    }
}

setInterval(updateClock, 1000);

document.getElementById('btn-toggle-calendar').addEventListener('click', () => {
    const calendar = document.getElementById('calendar-widget');
    const btn = document.getElementById('btn-toggle-calendar');
    const isHidden = calendar.style.display === 'none';
    
    if (isHidden) {
        calendar.style.display = 'flex';
        btn.classList.add('active');
        renderCalendar();
    } else {
        calendar.style.display = 'none';
        btn.classList.remove('active');
    }
});

document.getElementById('prev-month').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
});

document.getElementById('next-month').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
});

// --- Lógica de Arrastre Universal (Mouse + Touch) ---
function makeDraggable(element, handle) {
    let active = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let dragThreshold = 5; // Pixels to move before starting actual drag
    let hasMoved = false;
    let startX, startY;

    handle.addEventListener("pointerdown", dragStart, false);
    document.addEventListener("pointerup", dragEnd, false);
    document.addEventListener("pointermove", drag, false);

    function dragStart(e) {
        if (e.target.closest('button') || e.target.closest('input')) return;

        startX = e.clientX;
        startY = e.clientY;
        
        const rect = element.getBoundingClientRect();
        initialX = e.clientX - rect.left;
        initialY = e.clientY - rect.top;

        active = true;
        hasMoved = false;
    }

    function dragEnd() {
        active = false;
        element.style.zIndex = '10';
    }

    function drag(e) {
        if (active) {
            if (!hasMoved) {
                const distance = Math.hypot(e.clientX - startX, e.clientY - startY);
                if (distance > dragThreshold) {
                    hasMoved = true;
                    // Preparar elemento solo cuando realmente empezamos a mover
                    element.style.right = 'auto';
                    element.style.bottom = 'auto';
                    element.style.transform = 'none';
                    element.style.margin = '0';
                    element.style.zIndex = '1000';
                } else {
                    return;
                }
            }
            
            e.preventDefault();
            
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            // Restricción para no salirse de la pantalla
            const maxX = window.innerWidth - element.offsetWidth;
            const maxY = window.innerHeight - element.offsetHeight;
            
            // Permitir un poco de margen
            if (currentX < 0) currentX = 0;
            if (currentY < 0) currentY = 0;
            if (currentX > maxX) currentX = maxX;
            if (currentY > maxY) currentY = maxY;

            element.style.left = currentX + "px";
            element.style.top = currentY + "px";
        }
    }
}

// --- Lógica del Temporizador ---
let timerInterval = null;
let remainingTime = 0;
let isTimerRunning = false;

function updateTimerDisplay() {
    const dispMin = document.getElementById('display-min');
    const dispSec = document.getElementById('display-sec');
    if (!dispMin || !dispSec) return;

    const minutes = Math.floor(remainingTime / 60);
    const seconds = remainingTime % 60;
    
    dispMin.textContent = minutes.toString().padStart(2, '0');
    dispSec.textContent = seconds.toString().padStart(2, '0');
}

document.getElementById('btn-toggle-timer').addEventListener('click', () => {
    const timer = document.getElementById('timer-widget');
    const btn = document.getElementById('btn-toggle-timer');
    const isHidden = timer.style.display === 'none';
    
    if (isHidden) {
        timer.style.display = 'flex';
        btn.classList.add('active');
    } else {
        timer.style.display = 'none';
        btn.classList.remove('active');
    }
});

const btnStartTimer = document.getElementById('btn-start-timer');
btnStartTimer.addEventListener('click', () => {
    const tWidget = document.getElementById('timer-widget');
    if (isTimerRunning) {
        // Detener
        clearInterval(timerInterval);
        isTimerRunning = false;
        btnStartTimer.textContent = 'Iniciar';
        btnStartTimer.classList.remove('running');
        tWidget.classList.remove('running');
    } else {
        // Iniciar
        if (remainingTime <= 0) {
            const mins = parseInt(document.getElementById('display-min').textContent) || 0;
            const secs = parseInt(document.getElementById('display-sec').textContent) || 0;
            remainingTime = (mins * 60) + secs;
        }
        
        if (remainingTime > 0) {
            isTimerRunning = true;
            btnStartTimer.textContent = 'Detener';
            btnStartTimer.classList.add('running');
            tWidget.classList.add('running');
            
            timerInterval = setInterval(() => {
                remainingTime--;
                updateTimerDisplay();
                
                if (remainingTime <= 0) {
                    clearInterval(timerInterval);
                    isTimerRunning = false;
                    btnStartTimer.textContent = 'Iniciar';
                    btnStartTimer.classList.remove('running');
                    tWidget.classList.remove('running');
                    alert('¡Tiempo agotado!');
                }
            }, 1000);
        }
    }
});

window.adjustTimer = function(type, delta) {
    if (isTimerRunning) return; // No ajustar mientras corre
    
    const minSpan = document.getElementById('display-min');
    const secSpan = document.getElementById('display-sec');
    
    if (type === 'min') {
        let val = parseInt(minSpan.textContent) + delta;
        if (val < 0) val = 0;
        if (val > 99) val = 99;
        minSpan.textContent = val.toString().padStart(2, '0');
    } else {
        let val = parseInt(secSpan.textContent) + delta;
        if (val < 0) val = 59;
        if (val > 59) val = 0;
        secSpan.textContent = val.toString().padStart(2, '0');
    }
    
    // Actualizar tiempo restante inmediatamente para feedback visual
    const mins = parseInt(minSpan.textContent) || 0;
    const secs = parseInt(secSpan.textContent) || 0;
    remainingTime = (mins * 60) + secs;
    updateTimerDisplay();
};

document.getElementById('btn-reset-timer').addEventListener('click', () => {
    clearInterval(timerInterval);
    isTimerRunning = false;
    remainingTime = 0;
    updateTimerDisplay();
    btnStartTimer.textContent = 'Iniciar';
    btnStartTimer.classList.remove('running');
    document.getElementById('timer-widget').classList.remove('running');
});

// Aplicar arrastre a los widgets
const calendarWidget = document.getElementById('calendar-widget');
const calendarHeader = calendarWidget.querySelector('.calendar-header');
makeDraggable(calendarWidget, calendarHeader);

const clockWidget = document.getElementById('clock-widget');
makeDraggable(clockWidget, clockWidget);

const timerWidget = document.getElementById('timer-widget');
const timerHeader = timerWidget.querySelector('.widget-header');
makeDraggable(timerWidget, timerHeader);

// --- Ocultar/Mostrar Barra de Herramientas ---
const toolbar = document.querySelector('.toolbar');
const btnHideToolbar = document.getElementById('btn-hide-toolbar');
const btnShowToolbarInline = document.getElementById('btn-show-toolbar-inline');

btnHideToolbar.addEventListener('click', () => {
    toolbar.classList.add('hidden');
    saveSettings();
});

btnShowToolbarInline.addEventListener('click', () => {
    toolbar.classList.remove('hidden');
    saveSettings();
});

// --- Herramienta de Transportador SVG ---
function addProtractor(inverted = false) {
    const radius = 180;
    
    // Generar contenido SVG matemáticamente
    let svgContent = `<svg width="400" height="220" xmlns="http://www.w3.org/2000/svg">
        <path d="M 20 200 A 180 180 0 0 1 380 200 L 20 200 Z" fill="rgba(255, 255, 255, 0.3)" stroke="#333" stroke-width="2"/>
        <line x1="20" y1="200" x2="380" y2="200" stroke="#333" stroke-width="1.5"/>
        <line x1="200" y1="185" x2="200" y2="215" stroke="#333" stroke-width="1"/>
        <line x1="185" y1="200" x2="215" y2="200" stroke="#333" stroke-width="1"/>
        <circle cx="200" cy="200" r="4" fill="#333"/>
    `;
    
    for (let i = 0; i <= 180; i++) {
        const rad = (i * Math.PI) / 180;
        const x1 = 200 + (radius * Math.cos(Math.PI + rad));
        const y1 = 200 + (radius * Math.sin(Math.PI + rad));
        
        let length = 8;
        if (i % 10 === 0) length = 22;
        else if (i % 5 === 0) length = 14;
        
        const x2 = 200 + ((radius - length) * Math.cos(Math.PI + rad));
        const y2 = 200 + ((radius - length) * Math.sin(Math.PI + rad));
        
        svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#333" stroke-width="${i % 10 === 0 ? 2 : 1}"/>`;
        
        if (i % 10 === 0) {
            const xText = 200 + ((radius - 40) * Math.cos(Math.PI + rad));
            const yText = 200 + ((radius - 40) * Math.sin(Math.PI + rad));
            // Lógica de inversión: si inverted es true, 0 empieza a la derecha (180 - i)
            const valorAMostrar = inverted ? (180 - i) : i;
            svgContent += `<text x="${xText}" y="${yText}" font-family="'Inter', sans-serif" font-size="14" font-weight="700" text-anchor="middle" alignment-baseline="middle" transform="rotate(${i - 90}, ${xText}, ${yText})">${valorAMostrar}</text>`;
        }
    }
    svgContent += `</svg>`;
    
    fabric.loadSVGFromString(svgContent, (objects, options) => {
        const protractor = fabric.util.groupSVGElements(objects, options);
        protractor.set({
            left: canvas.width / 2,
            top: canvas.height / 2,
            originX: 'center',
            originY: 'bottom',
            cornerColor: '#7fb5ff',
            cornerStrokeColor: '#6366f1',
            transparentCorners: false,
            cornerStyle: 'circle',
            cornerSize: 12,
            borderColor: '#7fb5ff',
            borderDashArray: [5, 5],
            padding: 5,
            inverted: inverted // Guardar estado
        });
        
        // Agregar botón de inversión personalizado (Top-Left)
        protractor.controls.flip = new fabric.Control({
            x: -0.5,
            y: -0.5,
            offsetX: -15,
            offsetY: -35,
            cursorStyle: 'pointer',
            render: function(ctx, left, top, styleOverride, fabricObject) {
                const size = 26;
                ctx.save();
                ctx.translate(left, top);
                ctx.beginPath();
                ctx.arc(0, 0, size/2, 0, 2 * Math.PI, false);
                ctx.fillStyle = 'rgba(99, 102, 241, 0.6)'; // Semi-transparente
                ctx.fill();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                ctx.font = '14px Arial';
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('⇄', 0, 0);
                ctx.restore();
            },
            mouseUpHandler: function(eventData, transform) {
                const target = transform.target;
                const wasInverted = target.inverted;
                const currentProps = {
                    left: target.left, top: target.top, scaleX: target.scaleX, scaleY: target.scaleY, angle: target.angle
                };
                canvas.remove(target);
                addProtractor(!wasInverted);
                const newObj = canvas.getActiveObject();
                if (newObj) {
                    newObj.set(currentProps);
                    newObj.setCoords();
                    canvas.renderAll();
                }
                return true;
            }
        });

        // Botón para eliminar (Top-Right)
        protractor.controls.remove = new fabric.Control({
            x: 0.5,
            y: -0.5,
            offsetX: 15,
            offsetY: -35,
            cursorStyle: 'pointer',
            render: function(ctx, left, top, styleOverride, fabricObject) {
                const size = 26;
                const isHovered = (fabricObject.canvas && fabricObject.canvas.getActiveControl && fabricObject.canvas.getActiveControl().name === 'remove');
                
                ctx.save();
                ctx.translate(left, top);
                ctx.beginPath();
                ctx.arc(0, 0, size/2, 0, 2 * Math.PI, false);
                
                // Si se está tocando o el mouse está encima (según estado activo), poner rojo
                ctx.fillStyle = isHovered ? 'rgba(239, 68, 68, 0.9)' : 'rgba(150, 150, 150, 0.5)';
                
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                
                // Dibujar una X
                ctx.strokeStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(-5, -5);
                ctx.lineTo(5, 5);
                ctx.moveTo(5, -5);
                ctx.lineTo(-5, 5);
                ctx.stroke();
                
                ctx.restore();
            },
            mouseUpHandler: function(eventData, transform) {
                const target = transform.target;
                canvas.remove(target);
                canvas.requestRenderAll();
                return true;
            }
        });
        
        // Efecto visual: cambiar color en hover (simulado al capturar el evento del canvas)
        canvas.on('mouse:move', (options) => {
            if (options.target === protractor) {
                canvas.requestRenderAll(); // Forzar re-render de los controles
            }
        });
        
        protractor.scale(1.5);
        canvas.add(protractor);
        canvas.setActiveObject(protractor);
        canvas.renderAll();
    });
}

document.getElementById('btn-protractor').addEventListener('click', () => addProtractor(false));

// --- Herramienta de Regla 60cm SVG ---
function addRuler() {
    const cmCount = 60;
    const pxPerCm = 20; // Escala visual base
    const width = (cmCount * pxPerCm) + 40; // Margen extra
    const height = 70;
    
    let svgContent = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Cuerpo de la regla -->
        <rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="rgba(255, 255, 255, 0.3)" stroke="#333" stroke-width="2"/>
    `;
    
    // Generar Marcas (mm y cm)
    for (let mm = 0; mm <= cmCount * 10; mm++) {
        const x = 20 + (mm * (pxPerCm / 10));
        let markHeight = 8;
        let strokeW = 1;
        
        if (mm % 10 === 0) {
            markHeight = 22; // Centímetro
            strokeW = 2;
            // Número del centímetro
            svgContent += `<text x="${x}" y="50" font-family="'Inter', sans-serif" font-size="12" font-weight="700" text-anchor="middle" fill="#333">${mm / 10}</text>`;
        } else if (mm % 5 === 0) {
            markHeight = 14; // Medio centímetro
        }
        
        svgContent += `<line x1="${x}" y1="0" x2="${x}" y2="${markHeight}" stroke="#333" stroke-width="${strokeW}"/>`;
    }
    
    svgContent += `</svg>`;
    
    fabric.loadSVGFromString(svgContent, (objects, options) => {
        const ruler = fabric.util.groupSVGElements(objects, options);
        ruler.set({
            left: canvas.width / 2,
            top: canvas.height / 2,
            originX: 'center',
            originY: 'center',
            cornerColor: '#7fb5ff',
            cornerStrokeColor: '#6366f1',
            transparentCorners: false,
            cornerStyle: 'circle',
            cornerSize: 12,
            borderColor: '#7fb5ff',
            borderDashArray: [5, 5],
            padding: 5
        });
        
        // Botón para eliminar (Top-Right)
        ruler.controls.remove = new fabric.Control({
            x: 0.5,
            y: -0.5,
            offsetX: 15,
            offsetY: -35,
            cursorStyle: 'pointer',
            render: function(ctx, left, top, styleOverride, fabricObject) {
                const size = 26;
                const isHovered = (fabricObject.canvas && fabricObject.canvas.getActiveControl && fabricObject.canvas.getActiveControl().name === 'remove');
                ctx.save();
                ctx.translate(left, top);
                ctx.beginPath();
                ctx.arc(0, 0, size/2, 0, 2 * Math.PI, false);
                ctx.fillStyle = isHovered ? 'rgba(239, 68, 68, 0.9)' : 'rgba(150, 150, 150, 0.5)';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.strokeStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(-5, -5); ctx.lineTo(5, 5); ctx.moveTo(5, -5); ctx.lineTo(-5, 5);
                ctx.stroke();
                ctx.restore();
            },
            mouseUpHandler: function(eventData, transform) {
                canvas.remove(transform.target);
                canvas.requestRenderAll();
                return true;
            }
        });

        canvas.add(ruler);
        canvas.setActiveObject(ruler);
        canvas.renderAll();
    });
}

document.getElementById('btn-ruler').addEventListener('click', addRuler);



// --- Soporte para Pegar Imágenes ---
window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.includes('image')) {
            const blob = item.getAsFile();
            const reader = new FileReader();
            reader.onload = function(event) {
                fabric.Image.fromURL(event.target.result, (img) => {
                    // Configurar estilo de selección estilo "celeste"
                    img.set({
                        cornerColor: '#7fb5ff',
                        cornerStrokeColor: '#6366f1',
                        transparentCorners: false,
                        cornerStyle: 'circle',
                        cornerSize: 10,
                        padding: 10,
                        borderColor: '#7fb5ff',
                        borderDashArray: [5, 5]
                    });
                    
                    // Escalar si es muy grande
                    if (img.width > canvas.width * 0.7) {
                        img.scaleToWidth(canvas.width * 0.7);
                    }
                    
                    canvas.add(img);
                    canvas.setActiveObject(img);
                    canvas.renderAll();
                });
            };
            reader.readAsDataURL(blob);
        }
    }
});

// Deseleccionar al hacer clic en área vacía
canvas.on('selection:cleared', () => {
    canvas.renderAll();
});

const dateWidget = document.getElementById('date-widget');
makeDraggable(dateWidget, dateWidget);

// Inicializar fecha, calendario y temporizador
updateDateDisplay();
renderCalendar();
updateTimerDisplay();

// Cargar configuración guardada
setTimeout(loadSettings, 100);

// --- Lógica de Configuración (Cursos y Estudiantes) ---
let courseData = JSON.parse(localStorage.getItem('pizarraCourseData')) || [];

function saveCourseData() {
    localStorage.setItem('pizarraCourseData', JSON.stringify(courseData));
    renderCourses();
    updateCourseSelector();
}

function renderCourses() {
    const list = document.getElementById('courses-list');
    if (!list) return;
    list.innerHTML = '';
    
    courseData.forEach((course, index) => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="item-info">
                <i class='bx bx-book-bookmark'></i>
                <span>${course.name} (${course.students.length} alumnos)</span>
            </div>
            <div class="item-actions">
                <button onclick="deleteCourse(${index})"><i class='bx bx-trash'></i></button>
            </div>
        `;
        list.appendChild(item);
    });
}

function updateCourseSelector() {
    const selector = document.getElementById('course-selector-for-students');
    if (!selector) return;
    
    const currentValue = selector.value;
    selector.innerHTML = '<option value="">Selecciona un curso...</option>';
    
    courseData.forEach((course) => {
        const opt = document.createElement('option');
        opt.value = course.id;
        opt.textContent = course.name;
        selector.appendChild(opt);
    });
    
    selector.value = currentValue;
    renderStudents();
}

function renderStudents() {
    const selector = document.getElementById('course-selector-for-students');
    const list = document.getElementById('students-list');
    if (!list || !selector) return;
    
    list.innerHTML = '';
    const courseId = selector.value;
    if (!courseId) return;
    
    const course = courseData.find(c => c.id === courseId);
    if (!course) return;
    
    course.students.forEach((student, index) => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="item-info">
                <i class='bx bx-user'></i>
                <span>${student}</span>
            </div>
            <div class="item-actions">
                <button onclick="deleteStudent('${courseId}', ${index})"><i class='bx bx-trash'></i></button>
            </div>
        `;
        list.appendChild(item);
    });
}

// Modal Toggle
const settingsModal = document.getElementById('settings-modal');
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');

if (btnOpenSettings) {
    btnOpenSettings.addEventListener('click', () => {
        settingsModal.classList.add('active');
        renderCourses();
        updateCourseSelector();
    });
}

if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', () => {
        settingsModal.classList.remove('active');
    });
}

// Cerrar modal al hacer clic fuera
window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.classList.remove('active');
    }
});

// Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.config-section').forEach(s => s.classList.remove('active'));
        
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.target);
        if (target) target.classList.add('active');
    });
});

// Actions
const btnAddCourse = document.getElementById('add-course-btn');
if (btnAddCourse) {
    btnAddCourse.addEventListener('click', () => {
        const input = document.getElementById('course-input');
        const name = input.value.trim();
        if (name) {
            courseData.push({ id: Date.now().toString(), name: name, students: [] });
            input.value = '';
            saveCourseData();
        }
    });
}

window.deleteCourse = function(index) {
    if (confirm('¿Eliminar este curso? Se borrarán todos sus alumnos.')) {
        courseData.splice(index, 1);
        saveCourseData();
    }
};

const studentCourseSelector = document.getElementById('course-selector-for-students');
if (studentCourseSelector) {
    studentCourseSelector.addEventListener('change', renderStudents);
}

const btnAddStudent = document.getElementById('add-student-btn');
if (btnAddStudent) {
    btnAddStudent.addEventListener('click', () => {
        const selector = document.getElementById('course-selector-for-students');
        const input = document.getElementById('student-input');
        const rawContent = input.value;
        const courseId = selector.value;
        
        if (rawContent && courseId) {
            const course = courseData.find(c => c.id === courseId);
            if (course) {
                // Dividir por líneas, limpiar espacios y quitar vacíos
                const newStudents = rawContent.split('\n')
                                              .map(s => s.trim())
                                              .filter(s => s.length > 0);
                                              
                if (newStudents.length > 0) {
                    course.students.push(...newStudents);
                    input.value = '';
                    saveCourseData();
                    renderStudents();
                }
            }
        } else if (!courseId) {
            alert('Por favor selecciona un curso primero.');
        }
    });
}

window.deleteStudent = function(courseId, index) {
    const course = courseData.find(c => c.id === courseId);
    if (course) {
        course.students.splice(index, 1);
        saveCourseData();
        renderStudents();
    }
};

// --- Inicialización de Datos Ficticios para Pruebas ---
function initDummyData() {
    if (courseData.length === 0) {
        courseData.push({
            id: 'dummy-6c-mat',
            name: '6° C - Matemáticas',
            students: [
                'Lucas García', 'Sofía Martínez', 'Mateo Rodríguez', 'Valentina Pérez',
                'Nicolás Soto', 'Isidora Morales', 'Benjamín Muñoz', 'Florencia Herrera',
                'Matías Silva', 'Antonia Castro', 'Diego Figueroa', 'Emilia Espinoza',
                'Joaquín Lagos', 'Martina Rojas', 'Gabriel Valenzuela', 'Josefa Díaz',
                'Tomás Ibáñez', 'Fernanda Torres', 'Agustín Jara', 'Amaya Vidal',
                'Vicente Fuentes', 'Ignacia Araya', 'Felipe Reyes', 'Pascal Carrasco',
                'Maximiliano Vera', 'Maite Bravo', 'Cristóbal Contreras', 'Antonella Sepúlveda',
                'Sebastián Henríquez', 'Amanda Godoy', 'Alonso Guzmán', 'Catalina Sanhueza',
                'Bastián Pizarro', 'Isabel Palma', 'Julián Rivas', 'Trinidad Méndez',
                'Renato Salinas', 'Javiera Paredes', 'Esteban Ortiz', 'Elena Núñez'
            ]
        });
        courseData.push({
            id: 'dummy-6c-len',
            name: '6° C - Lenguaje',
            students: [
                'Alejandro Vega', 'Camila Soto', 'Rodrigo Paillán', 'Paula Quintanilla',
                'Daniel Arroyo', 'Natalia Cáceres', 'Francisco Leiva', 'Carla Venegas',
                'Manuel Saavedra', 'Andrea Lagos', 'Ricardo Urbina', 'Claudia Meneses',
                'Sergio Valdés', 'Beatriz Ahumada', 'Roberto Farías', 'Diana Monsalve',
                'Alberto Osorio', 'Gloria Villalobos', 'Fernando Maturana', 'Julia Carrasco',
                'Héctor Donoso', 'Marta Vergara', 'Raúl Bizama', 'Rosa Faúndez',
                'Enrique San Martín', 'Silvia Orellana', 'Hugo Tello', 'Inés Gallegos',
                'Iván Canales', 'Julieta Parra', 'Juan Pablo Roco', 'Laura Santis',
                'Luis Felipe Mora', 'María José Pino', 'Mario Duarte', 'Mónica Gatica',
                'Miguel Ángel Cordero', 'Nuria Espina', 'Óscar Navarro', 'Olga Varas'
            ]
        });
        saveCourseData();
    }
}
initDummyData();

// --- Lógica de la Ruleta (Random Picker) ---
const randomPickerWidget = document.getElementById('random-picker');
const btnTogglePicker = document.getElementById('btn-toggle-picker');
const btnClosePicker = document.getElementById('btn-close-picker');
const pickerCourseSelect = document.getElementById('picker-course-select');
const btnSpinStart = document.getElementById('btn-spin-start');
const randomResult = document.getElementById('random-result');
const historyList = document.getElementById('history-list');
const btnResetHistory = document.getElementById('btn-reset-history');

let pickerHistory = [];

function updatePickerCourseOptions() {
    if (!pickerCourseSelect) return;
    const currentVal = pickerCourseSelect.value;
    pickerCourseSelect.innerHTML = '<option value="">Selecciona un curso...</option>';
    courseData.forEach(course => {
        const opt = document.createElement('option');
        opt.value = course.id;
        opt.textContent = course.name;
        pickerCourseSelect.appendChild(opt);
    });
    if (currentVal) pickerCourseSelect.value = currentVal;
}

btnTogglePicker.addEventListener('click', () => {
    randomPickerWidget.classList.toggle('active');
    updatePickerCourseOptions();
    // Re-dimensionar el canvas ya que el espacio disponible cambia
    setTimeout(resizeCanvas, 50); 
});

btnClosePicker.addEventListener('click', () => {
    randomPickerWidget.classList.remove('active');
    setTimeout(resizeCanvas, 50);
});

btnSpinStart.addEventListener('click', () => {
    const courseId = pickerCourseSelect.value;
    if (!courseId) {
        alert('Por favor selecciona un curso primero.');
        return;
    }

    const course = courseData.find(c => c.id === courseId);
    if (!course || course.students.length === 0) {
        alert('Este curso no tiene estudiantes.');
        return;
    }

    // Filtrar estudiantes que no han salido todavía
    const availableStudents = course.students.filter(s => !pickerHistory.includes(s));

    if (availableStudents.length === 0) {
        alert('¡Todos los estudiantes ya han participado! Reinicia el historial para continuar.');
        return;
    }

    // Animación de sorteo
    btnSpinStart.disabled = true;
    randomResult.classList.add('animating');
    
    let duration = 1000;
    let interval = setInterval(() => {
        const tempIndex = Math.floor(Math.random() * availableStudents.length);
        randomResult.textContent = availableStudents[tempIndex];
    }, 100);

    setTimeout(() => {
        clearInterval(interval);
        randomResult.classList.remove('animating');
        
        // Resultado final
        const finalIndex = Math.floor(Math.random() * availableStudents.length);
        const winnersName = availableStudents[finalIndex];
        
        randomResult.textContent = winnersName;
        pickerHistory.push(winnersName);
        renderPickerHistory();
        btnSpinStart.disabled = false;
    }, duration);
});

function renderPickerHistory() {
    historyList.innerHTML = '';
    pickerHistory.forEach((name, index) => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <span class="history-name"><small>${index + 1}.</small> ${name}</span>
            <button class="btn-remove-history" onclick="removeFromHistory(${index})">
                <i class='bx bx-x'></i>
            </button>
        `;
        historyList.appendChild(item);
    });
    // Auto scroll al final del historial
    historyList.scrollTop = historyList.scrollHeight;
}

window.removeFromHistory = function(index) {
    pickerHistory.splice(index, 1);
    renderPickerHistory();
};

btnResetHistory.addEventListener('click', () => {
    pickerHistory = [];
    renderPickerHistory();
    randomResult.textContent = '¿Quién será?';
});

// Hacer el widget de ruleta arrastrable
// Hacer el widget de ruleta ya no es arrastrable por ser sidebar

// --- Personalización de Barra Mejorada (Drag & Drop) ---
let sortableInstances = [];
let longPressTimer;
let isEditModeActive = false;
const LONG_PRESS_DURATION = 500; 

function initToolbarCustomization() {
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return;

    // Delegación de eventos para Long Press
    toolbar.addEventListener('pointerdown', (e) => {
        if (isEditModeActive) return;
        
        const btn = e.target.closest('.tool-btn, .dropbtn');
        if (!btn) return;
        
        // Efecto visual de "carga"
        btn.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        btn.style.transform = 'scale(0.85)';
        
        longPressTimer = setTimeout(() => {
            btn.style.transform = '';
            enterEditMode();
        }, LONG_PRESS_DURATION);
        
        const cancel = () => {
            clearTimeout(longPressTimer);
            btn.style.transform = '';
        };
        
        const onMove = (moveEvent) => {
            if (Math.abs(moveEvent.clientX - e.clientX) > 15 || Math.abs(moveEvent.clientY - e.clientY) > 15) {
                cancel();
                window.removeEventListener('pointermove', onMove);
            }
        };

        window.addEventListener('pointerup', cancel, { once: true });
        window.addEventListener('pointermove', onMove);
    });

    // Bloqueador de acciones en modo edición (captura para ir antes que otros listeners)
    toolbar.addEventListener('click', (e) => {
        if (isEditModeActive) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
}

function enterEditMode() {
    if (isEditModeActive) return;
    isEditModeActive = true;
    
    const toolbar = document.querySelector('.toolbar');
    toolbar.classList.add('edit-mode');
    
    // Cerrar paleta lateral para despejar
    if (sidePalette.classList.contains('active')) {
        sidePalette.classList.remove('active');
        btnTogglePalette.classList.remove('active');
    }

    let exitBtn = document.querySelector('.exit-edit-btn');
    if (!exitBtn) {
        exitBtn = document.createElement('button');
        exitBtn.className = 'exit-edit-btn';
        exitBtn.innerHTML = '<i class="bx bx-check"></i> Finalizar Personalización';
        exitBtn.onclick = exitEditMode;
        document.body.appendChild(exitBtn);
    }
    exitBtn.style.display = 'flex';

    let addGrpBtn = document.querySelector('.add-group-btn');
    if (!addGrpBtn) {
        addGrpBtn = document.createElement('button');
        addGrpBtn.className = 'add-group-btn';
        addGrpBtn.innerHTML = '<i class="bx bx-plus-circle"></i> Crear Grupo';
        addGrpBtn.onclick = addNewGroup;
        document.body.appendChild(addGrpBtn);
    }
    addGrpBtn.style.display = 'flex';

    // Configuración común de Sortable
    const sortConfig = {
        group: 'toolbar-shared',
        animation: 180,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        fallbackTolerance: 3,
        onEnd: saveToolbarLayout
    };

    // Barra principal
    sortableInstances.push(new Sortable(toolbar, {
        ...sortConfig,
        draggable: '.tool-btn, .dropup',
        filter: '.divider'
    }));

    // Grupos internos
    document.querySelectorAll('.dropup-content').forEach(content => {
        sortableInstances.push(new Sortable(content, sortConfig));
    });
}

function exitEditMode() {
    isEditModeActive = false;
    document.querySelector('.toolbar').classList.remove('edit-mode');
    const exitBtn = document.querySelector('.exit-edit-btn');
    if (exitBtn) exitBtn.style.display = 'none';
    const addBtn = document.querySelector('.add-group-btn');
    if (addBtn) addBtn.style.display = 'none';

    sortableInstances.forEach(s => s.destroy());
    sortableInstances = [];
}

function addNewGroup() {
    const panel = document.getElementById('group-icon-panel');
    const inner = document.getElementById('group-icon-inner');
    if (!panel || !inner) {
        finalizeNewGroup('bx-category');
        return;
    }
    
    // Position near bottom of screen since we're in edit mode
    panel.style.left = '50%';
    panel.style.top = '60%';
    panel.style.transform = 'translate(-50%,-50%)';
    panel.style.display = 'block';
    
    const icons = ['bx-category','bx-folder','bx-briefcase','bx-package','bx-book',
                   'bx-star','bx-heart','bx-cube','bx-layer','bx-archive'];

    inner.innerHTML = '';
    icons.forEach(ic => {
        const b = document.createElement('button');
        b.style.cssText = 'background:transparent;border:1px solid transparent;border-radius:8px;padding:6px;cursor:pointer;font-size:22px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;color:var(--text,#333);';
        b.innerHTML = `<i class="bx ${ic}"></i>`;
        b.onmouseenter = () => { b.style.background='rgba(99,102,241,0.1)'; b.style.borderColor='#6366f1'; };
        b.onmouseleave = () => { b.style.background='transparent'; b.style.borderColor='transparent'; };
        b.onclick = () => {
            panel.style.display = 'none';
            finalizeNewGroup(ic);
        };
        inner.appendChild(b);
    });
}

function finalizeNewGroup(iconClass) {
    const toolbar = document.querySelector('.toolbar');
    const timestamp = Date.now();
    
    // Crear la estructura de grupo
    const groupDiv = document.createElement('div');
    groupDiv.className = 'tool-group dropup';
    groupDiv.innerHTML = `
        <button class="tool-btn dropbtn" id="btn-group-${timestamp}" title="Nuevo Grupo">
            <i class='bx ${iconClass}'></i>
        </button>
        <div class="dropup-content"></div>
    `;
    
    toolbar.appendChild(groupDiv);
    
    // Inicializar Sortable para el nuevo contenido del grupo
    const content = groupDiv.querySelector('.dropup-content');
    const sortConfig = {
        group: 'toolbar-shared',
        animation: 180,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        fallbackTolerance: 3,
        onEnd: saveToolbarLayout
    };
    sortableInstances.push(new Sortable(content, sortConfig));
    
    saveToolbarLayout();
}

function saveToolbarLayout() {
    const layout = [];
    const children = document.querySelector('.toolbar').children;
    
    Array.from(children).forEach(el => {
        if (el.classList.contains('divider')) {
            layout.push({ type: 'divider' });
        } else if (el.classList.contains('tool-btn') && el.id) {
            layout.push({ type: 'button', id: el.id });
        } else if (el.classList.contains('dropup')) {
            const btn = el.querySelector('.dropbtn');
            const items = Array.from(el.querySelectorAll('.dropup-content .tool-btn'))
                               .map(b => b.id).filter(id => id);
            
            // ELIMINACIÓN AUTOMÁTICA DE GRUPOS VACÍOS
            if (items.length === 0) {
                el.remove(); // Eliminar del DOM inmediatamente
            } else if (btn && btn.id) {
                layout.push({ type: 'group', id: btn.id, items: items });
            }
        }
    });

    localStorage.setItem('pizarraToolbarLayout_v8', JSON.stringify(layout));
}

function restoreToolbarLayout() {
    const saved = localStorage.getItem('pizarraToolbarLayout_v8');
    if (!saved) return;

    try {
        const layout = JSON.parse(saved);
        const toolbar = document.querySelector('.toolbar');
        
        // Guardar elementos en un fragmento temporal para no perderlos
        const elementsStore = {};
        const groupsStore = {};
        
        document.querySelectorAll('.toolbar .tool-btn, .toolbar .dropbtn').forEach(el => {
            if (el.id) elementsStore[el.id] = el;
        });
        document.querySelectorAll('.toolbar .dropup').forEach(g => {
            const btn = g.querySelector('.dropbtn');
            if (btn && btn.id) groupsStore[btn.id] = g;
        });

        // Reubicar
        toolbar.innerHTML = '';
        layout.forEach(entry => {
            if (entry.type === 'divider') {
                const d = document.createElement('div');
                d.className = 'divider';
                toolbar.appendChild(d);
            } else if (entry.type === 'button' && elementsStore[entry.id]) {
                toolbar.appendChild(elementsStore[entry.id]);
            } else if (entry.type === 'group' && groupsStore[entry.id]) {
                const group = groupsStore[entry.id];
                const content = group.querySelector('.dropup-content');
                content.innerHTML = '';
                entry.items.forEach(itemId => {
                    if (elementsStore[itemId]) content.appendChild(elementsStore[itemId]);
                });
                toolbar.appendChild(group);
            }
        });
    } catch (e) {
        console.error("Error restaurando barra:", e);
    }
}

// Pegatinas / Iconos de Sistema
// Usamos SVG paths en lugar de emojis para evitar bugs de Fabric.js y problemas de encoding
var stickerIconDefs = {
    'Estrella': '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
    'Corazon': '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    'Check': '<polyline points="20 6 9 17 4 12"/>',
    'Cruz': '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    'Pregunta': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    'Alerta': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    'Trofeo': '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    'Rayo': '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    'Ojo': '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    'Cohete': '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    'Bombilla': '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    'Diploma': '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
    'Crecimiento': '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    'Objetivo': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    'Pulgar': '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>',
    'Fiesta': '<path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12v0c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11v0c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98v0C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/>'
};

var stickerBtnRef = btnSystemIcons || document.getElementById('btn-system-icons');

function initStickerPalette() {
    var grid = document.getElementById('sticker-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    var names = Object.keys(stickerIconDefs);
    names.forEach(function(name) {
        var btn = document.createElement('button');
        btn.className = 'tool-btn';
        btn.title = name;
        btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + stickerIconDefs[name] + '</svg>';
        btn.onclick = function(ev) {
            ev.stopPropagation();
            addStickerToCanvas(name);
        };
        grid.appendChild(btn);
    });
}

if (stickerBtnRef) {
    stickerBtnRef.addEventListener('click', function(e) {
        const isOpen = stickerPalette.classList.contains('open');
        closeAllPanels();
        if (!isOpen) {
            stickerPalette.classList.add('open');
            stickerBtnRef.classList.add('active');
        }
        e.stopPropagation();
    });
}

// Inicializar pegatinas al cargar
setTimeout(initStickerPalette, 200);

function addStickerToCanvas(stickerName) {
    canvas.isDrawingMode = false;
    setActiveTool(btnSelect);
    
    var vpt = canvas.viewportTransform;
    var cw = canvas.getWidth();
    var ch = canvas.getHeight();
    var centerX = cw / 2;
    var centerY = ch / 2;
    if (vpt) {
        centerX = (cw / 2 - vpt[4]) / vpt[0];
        centerY = (ch / 2 - vpt[5]) / vpt[3];
    }
    
    var svgContent = stickerIconDefs[stickerName];
    if (!svgContent) return;
    
    var svgString = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="' + currentColor + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + svgContent + '</svg>';
    
    fabric.loadSVGFromString(svgString, function(objects, options) {
        var group = fabric.util.groupSVGElements(objects, options);
        group.set({
            left: snapToGrid(centerX),
            top: snapToGrid(centerY),
            originX: 'center',
            originY: 'center',
            hasBorders: false,
            cornerColor: '#ffffff',
            cornerStrokeColor: '#6366f1',
            cornerSize: 12,
            cornerStyle: 'circle',
            strokeUniform: true
        });
        group.setControlsVisibility({
            mtr: false,
            ml: false,
            mr: false,
            mt: false,
            mb: false
        });
        canvas.add(group);
        canvas.setActiveObject(group);
        canvas.requestRenderAll();
    });
}

// (Lógica del dado movida al panel de dados y fichas)

function createDice(left, top) {
    const size = 80;
    const color = currentColor || '#2d3748';
    
    // Cuerpo del dado
    const body = new fabric.Rect({
        width: size,
        height: size,
        rx: 15,
        ry: 15,
        fill: '#ffffff',
        stroke: '#2d3748', // Borde oscuro constante para mayor legibilidad
        strokeWidth: 4,
        originX: 'center',
        originY: 'center',
        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.1)', blur: 10, offsetX: 5, offsetY: 5 })
    });

    const dice = new fabric.Group([body], {
        left: left,
        top: top,
        originX: 'center',
        originY: 'center',
        selectable: true,
        hasControls: false,
        hasBorders: false, // Desactivar el borde azul
        name: 'dice',
        role: 'dice',
        diceValue: 1
    });

    // Función para dibujar los puntos según el valor
    dice.updateValue = function(val) {
        // Eliminar puntos anteriores
        const objects = this.getObjects();
        for (let i = objects.length - 1; i > 0; i--) {
            this.remove(objects[i]);
        }
        
        this.diceValue = val;
        const dotRadius = size * 0.08;
        const offset = size * 0.25;
        
        // Colores premium para cada cara (bien legibles)
        const faceColors = {
            1: '#ef798a', // Coral
            2: '#f7a976', // Naranja
            3: '#82d192', // Verde
            4: '#6bc0cc', // Turquesa
            5: '#7fb5ff', // Azul
            6: '#9a8ced'  // Morado
        };
        const dotColor = faceColors[val];

        const positions = {
            1: [[0, 0]],
            2: [[-offset, -offset], [offset, offset]],
            3: [[-offset, -offset], [0, 0], [offset, offset]],
            4: [[-offset, -offset], [offset, -offset], [-offset, offset], [offset, offset]],
            5: [[-offset, -offset], [offset, -offset], [0, 0], [-offset, offset], [offset, offset]],
            6: [[-offset, -offset], [offset, -offset], [-offset, 0], [offset, 0], [-offset, offset], [offset, offset]]
        };

        positions[val].forEach(pos => {
            const dot = new fabric.Circle({
                radius: dotRadius,
                fill: dotColor,
                left: pos[0],
                top: pos[1],
                originX: 'center',
                originY: 'center',
                selectable: false,
                evented: false
            });
            this.add(dot);
        });
        
        canvas.requestRenderAll();
    };

    // Función para lanzar el dado con animación exagerada
    dice.roll = function() {
        let rolls = 0;
        const maxRolls = 20; // Más tiempo girando
        const initialLeft = this.left;
        const initialTop = this.top;

        const interval = setInterval(() => {
            const tempVal = Math.floor(Math.random() * 6) + 1;
            this.updateValue(tempVal);
            
            // Animación exagerada: Rotación fuerte y temblor de posición
            this.set({
                angle: Math.random() * 40 - 20, // Rotación de +/- 20 grados
                left: initialLeft + (Math.random() * 10 - 5), // Temblor lateral
                top: initialTop + (Math.random() * 10 - 5)     // Temblor vertical
            });
            
            canvas.requestRenderAll();
            rolls++;
            if (rolls >= maxRolls) {
                clearInterval(interval);
                const finalVal = Math.floor(Math.random() * 6) + 1;
                this.updateValue(finalVal);
                this.set({
                    angle: 0,
                    left: initialLeft,
                    top: initialTop
                });
                canvas.requestRenderAll();
                saveState();
            }
        }, 60);
    };

    let isDraggingDice = false;
    let diceStartPos = { x: 0, y: 0 };

    dice.on('mousedown', function(options) {
        isDraggingDice = false;
        diceStartPos = { x: dice.left, y: dice.top };
    });

    dice.on('moving', function() {
        isDraggingDice = true;
    });

    dice.on('mouseup', function(options) {
        // Calculamos la distancia movida
        const dist = Math.hypot(dice.left - diceStartPos.x, dice.top - diceStartPos.y);
        
        // Si no se ha movido (o se ha movido muy poco, umbral de 5px), es un click -> Lanzar
        if (!isDraggingDice && dist < 5 && !canvas.isPanningView) {
            dice.roll();
        }
    });

    dice.updateValue(Math.floor(Math.random() * 6) + 1);
    canvas.add(dice);
    canvas.setActiveObject(dice);
    canvas.requestRenderAll();
    saveState();
}

// --- Lógica de Cuadrícula Infinita y Zoom ---
window.updateGridBackground = function() {
    if (!gridLayer) return;
    const vpt = canvas.viewportTransform;
    const zoom = canvas.getZoom();
    gridLayer.style.transform = `translate(${vpt[4]}px, ${vpt[5]}px) scale(${zoom})`;
};

if (btnGrid) {
    btnGrid.addEventListener('click', () => {
        const wrapper = document.querySelector('.canvas-panel');
        const isShowing = wrapper.classList.toggle('show-grid');
        btnGrid.classList.toggle('active', isShowing);
        if (isShowing) window.updateGridBackground();
    });
}

canvas.on('mouse:wheel', function(opt) {
    const delta = opt.e.deltaY;
    let zoom = canvas.getZoom();
    zoom *= 0.999 ** delta;
    if (zoom > 20) zoom = 20;
    if (zoom < 0.05) zoom = 0.05;
    canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
    opt.e.preventDefault();
    opt.e.stopPropagation();
    window.updateGridBackground();
});

canvas.on('mouse:move', () => {
    if (canvas.isPanning || canvas.isPanningView) {
        window.updateGridBackground();
    }
});

// Iniciar
initToolbarCustomization();
setTimeout(restoreToolbarLayout, 50);


