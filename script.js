// Initialization
const canvas = new fabric.Canvas('canvas', {
    isDrawingMode: false,
    backgroundColor: 'rgba(255, 255, 255, 0)', // Transparente para la cuadrícula
    selection: true // enable group selection
});

// Fullscreen canvas setup
function resizeCanvas() {
    canvas.setWidth(window.innerWidth);
    canvas.setHeight(window.innerHeight);
    canvas.renderAll();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Set initial size

// Setup tools
let isErasing = false;
let isDrawingPolygon = false;
let isDrawingAngle = false;
let isDrawingLine = false;
let isRecognitionMode = false;
let anglePhase = 0;
let referenceFontSize = null; // Para mantener consistencia en OCR
let isMouseDown = false;
let lastMouseEvent;

// Variables para polígono libre y ángulo
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

const btnFullscreen = document.getElementById('btn-fullscreen');
const btnSelect = document.getElementById('btn-select');
const btnMove = document.getElementById('btn-move');
const btnDraw = document.getElementById('btn-draw');
const btnLineTool = document.getElementById('btn-line');
const btnEraser = document.getElementById('btn-eraser');
const btnCustomPolygon = document.getElementById('btn-custom-polygon');
const btnAngle = document.getElementById('btn-angle');
const btnDelete = document.getElementById('btn-delete');
const btnOcr = document.getElementById('btn-ocr');
const btnTogglePalette = document.getElementById('btn-toggle-palette');
const sidePalette = document.getElementById('side-palette');
let swatches = document.querySelectorAll('.swatch');
let currentColor = '#2d3748';
let strokeWidthSlider = document.getElementById('stroke-width');
const polygonSidesInput = document.getElementById('polygon-sides');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');

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
        canvas.renderAll();
        isStateChanging = false;
        updateUndoRedoButtons();
    });
}

// Inicializar estado inicial (vacío)
setTimeout(() => saveState(), 100);

canvas.on('object:added', () => saveState());
canvas.on('object:modified', () => saveState());
canvas.on('object:removed', () => saveState());

btnUndo.addEventListener('click', undo);
btnRedo.addEventListener('click', redo);

const toolBtns = document.querySelectorAll('.tool-btn:not(#btn-delete)'); // Keep delete out of exclusive active states

// Initialize Drawing Brush
canvas.freeDrawingBrush.color = currentColor;
canvas.freeDrawingBrush.width = parseInt(strokeWidthSlider.value, 10);

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
    isRecognitionMode = (activeBtn === btnOcr);
    const isMoving = (activeBtn === btnMove);

    
    // Icono SVG para la goma (cursor personalizado)
    const svgEraser = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="#ffffff" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`;
    const eraserCursor = `url("data:image/svg+xml;utf8,${encodeURIComponent(svgEraser)}") 0 24, cell`;

    if (isErasing) {
        canvas.isDrawingMode = false;
        canvas.selection = false; 
        canvas.forEachObject(obj => obj.set('selectable', false));
        canvas.defaultCursor = eraserCursor;
        canvas.hoverCursor = eraserCursor;
    } else if (isMoving) {
        canvas.isDrawingMode = false;
        canvas.selection = true;
        canvas.forEachObject(obj => obj.set('selectable', true));
        canvas.defaultCursor = 'grab';
        canvas.hoverCursor = 'grab';
    } else {
        // Desactivar selección múltiple (cuadro azul) si estamos en modo dibujo (línea, ángulo, polígono)
        canvas.selection = !(isDrawingLine || isDrawingAngle || isDrawingPolygon || isRecognitionMode);
        canvas.forEachObject(obj => obj.set('selectable', true));
        canvas.defaultCursor = 'default';
        canvas.hoverCursor = 'move';
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
    document.querySelector('.canvas-container-wrapper').style.cursor = 'grab';
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

// Tool de Reconocimiento de Números
btnOcr.addEventListener('click', () => {
    canvas.isDrawingMode = true;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setActiveTool(btnOcr);
    document.querySelector('.canvas-container-wrapper').style.cursor = 'crosshair';
});

// Angle Tool
btnAngle.addEventListener('click', () => {
    canvas.isDrawingMode = false;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setActiveTool(btnAngle);
    document.querySelector('.canvas-container-wrapper').style.cursor = 'crosshair';
});

// Lógica de Toggle para el panel lateral de colores
btnTogglePalette.addEventListener('click', (e) => {
    sidePalette.classList.toggle('open');
    btnTogglePalette.classList.toggle('active');
    e.stopPropagation();
});

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
                        // Para texto usamos fill, para el resto stroke
                        if (obj.type === 'text' || obj.type === 'i-text') {
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

    strokeWidthSlider.addEventListener('input', (e) => {
        const width = parseInt(e.target.value, 10);
        canvas.freeDrawingBrush.width = width;
        
        const activeObjects = canvas.getActiveObjects();
        if (activeObjects.length) {
            activeObjects.forEach(obj => {
                obj.set({ strokeWidth: width });
            });
            canvas.requestRenderAll();
            saveState();
        }
    });
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
        radius: width * 1.5, fill: color, left: pts[0].x, top: pts[0].y,
        originX: 'center', originY: 'center', hasBorders: false, hasControls: false, hoverCursor: 'pointer'
    });
    
    const circleB = new fabric.Circle({
        radius: width * 2, fill: '#ffffff', stroke: color, strokeWidth: Math.max(3, width / 2),
        left: pts[1].x, top: pts[1].y,
        originX: 'center', originY: 'center', hasBorders: false, hasControls: false,
        hoverCursor: 'move'
    });
    
    const circleC = new fabric.Circle({
        radius: width * 1.5, fill: color, left: pts[2].x, top: pts[2].y,
        originX: 'center', originY: 'center', hasBorders: false, hasControls: false, hoverCursor: 'pointer'
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
        targetFindTolerance: 15,
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

// Eventos de ratón
canvas.on('mouse:down', (e) => {
    isMouseDown = true;
    
    if (canvas.defaultCursor === 'grab') {
        canvas.defaultCursor = 'grabbing';
        canvas.renderAll();
    }
    
    if (isErasing && e.target) {
        canvas.remove(e.target);
        return;
    }

    if (isDrawingLine) {
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
            originX: 'center', 
            originY: 'center',
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
        const pointer = canvas.getPointer(e.e);

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
            evented: false,
            originX: 'center',
            originY: 'center'
        });
        lineArray.push(activeLine);
        canvas.add(activeLine);
    }
});

canvas.on('mouse:move', (e) => {
    lastMouseEvent = e;
    if (isMouseDown && isErasing && e.target) {
        canvas.remove(e.target);
    }

    if (isDrawingLine && isMouseDown && activeLine) {
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
        const pointer = canvas.getPointer(e.e);
        activeLine.set({ x2: pointer.x, y2: pointer.y });
        canvas.requestRenderAll();
    }
});

canvas.on('mouse:up', () => {
    if (canvas.defaultCursor === 'grabbing') {
        canvas.defaultCursor = 'grab';
        canvas.renderAll();
    }

    if (isDrawingLine && activeLine) {
        const pointer = canvas.getPointer(lastMouseEvent.e);
        const snappedEnd = { x: snapToGrid(pointer.x), y: snapToGrid(pointer.y) };
        lineTempPts.push(snappedEnd);
        
        canvas.remove(activeLine);
        createInteractiveLine(
            lineTempPts[0], 
            lineTempPts[1], 
            currentColor, 
            parseInt(strokeWidthSlider.value, 10), 
            activeLineId
        );
        
        activeLine = null;
        lineTempPts = [];
        // Eliminado setActiveTool(btnSelect) para mantener la herramienta activa
        canvas.discardActiveObject().requestRenderAll();
    }
    isMouseDown = false;
});

// --- Lógica de Reconocimiento de Números (OCR) ---
let recognitionQueue = [];
let recognitionTimer = null;

canvas.on('path:created', (e) => {
    if (!isRecognitionMode) return;

    const path = e.path;
    recognitionQueue.push(path);

    // Reiniciar el temporizador (debounce)
    if (recognitionTimer) clearTimeout(recognitionTimer);
    
    recognitionTimer = setTimeout(() => {
        performRecognition();
    }, 200); // Esperar 0.2 segundos tras el último trazo para reconocer el número
});

function performRecognition() {
    if (recognitionQueue.length === 0) return;

    const strokes = recognitionQueue.map(path => {
        const points = path.path; // Array de comandos ['M', x, y], ['Q', x1, y1, x2, y2], etc.
        // Simplificamos: extraemos solo los puntos para el API de Google
        const x = [];
        const y = [];
        const t = []; // El tiempo es opcional pero ayuda
        
        let currentTime = 0;
        points.forEach((p, index) => {
            // El formato de path de Fabric suele ser [['M', x, y], ['Q', x1, y1, x2, y2], ...]
            // Tomamos el último par de coordenadas de cada comando
            const px = p[p.length - 2];
            const py = p[p.length - 1];
            
            if (typeof px === 'number' && typeof py === 'number') {
                x.push(px);
                y.push(py);
                t.push(currentTime++);
            }
        });
        return [x, y, t];
    });

    // Calcular el bounding box para colocar el texto después
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    recognitionQueue.forEach(path => {
        const bound = path.getBoundingRect();
        minX = Math.min(minX, bound.left);
        minY = Math.min(minY, bound.top);
        maxX = Math.max(maxX, bound.left + bound.width);
        maxY = Math.max(maxY, bound.top + bound.height);
    });

    // Llamar a la API de handwriting.js
    const options = {
        language: 'en',
        numOfWords: 1,
        numOfReturn: 5,
        width: canvas.width,
        height: canvas.height
    };

    handwriting.recognize(strokes, options, (res, err) => {
        if (err) {
            console.error("Error en reconocimiento:", err);
            recognitionQueue = [];
            return;
        }

        // Filtrar el primer resultado que sea un número, símbolo matemático o letra
        const allowedCharsRegex = /^[\d+\-X:x*/÷=()a-zA-ZáéíóúüñÁÉÍÓÚÜÑ ]+$/i;
        let recognizedText = res.find(s => allowedCharsRegex.test(s)) || res[0];

        if (recognizedText) {
            // Normalizar símbolos para el usuario (ej: x minúscula a X, o ÷ a :)
            recognizedText = recognizedText.replace(/x/g, 'X')
                                          .replace(/\*/g, 'X')
                                          .replace(/\//g, ':')
                                          .replace(/÷/g, ':');

            // Determinar el tamaño de fuente (el primero marca el estándar)
            if (!referenceFontSize) {
                referenceFontSize = Math.max(40, (maxY - minY) * 1.2);
            }

            // Eliminar los trazos originales
            recognitionQueue.forEach(p => canvas.remove(p));

            // Crear el objeto de texto
            const digitalNumber = new fabric.Text(recognizedText, {
                left: (minX + maxX) / 2,
                top: (minY + maxY) / 2,
                fontSize: referenceFontSize,
                fill: currentColor,
                fontFamily: "'Patrick Hand', cursive",
                fontWeight: '400',
                originX: 'center',
                originY: 'center',
                hasControls: false, // Ocultar manejadores de escalado
                hasBorders: false,  // Ocultar cuadro azul
                padding: 0          // Pegar el área de selección lo más posible al texto
            });

            canvas.add(digitalNumber);
            // No seleccionamos automáticamente para que no cambie de color al elegir el siguiente
            canvas.requestRenderAll();
        }

        recognitionQueue = [];
    });
}

// Borrar toda la pizarra
btnDelete.addEventListener('click', () => {
    if (confirm("¿Estás seguro de que quieres borrar TODA la pizarra?")) {
        const objects = canvas.getObjects();
        objects.forEach(obj => canvas.remove(obj));
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        
        // Reset font orientation consistency
        referenceFontSize = null;

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
    };
}

function processNewShape(shape) {
    canvas.isDrawingMode = false;
    canvas.add(shape);
    canvas.centerObject(shape);
    // No seleccionamos automáticamente para evitar cambios de color accidentales
    setActiveTool(btnSelect);
}

document.getElementById('btn-square').addEventListener('click', () => {
    const square = new fabric.Rect({
        ...getDefaultShapeStyle(),
        width: 100,
        height: 100
    });
    processNewShape(square);
});

document.getElementById('btn-rect').addEventListener('click', () => {
    const rect = new fabric.Rect({
        ...getDefaultShapeStyle(),
        width: 180,
        height: 100
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
document.getElementById('btn-polygon').addEventListener('click', () => {
    createPolygon();
});

polygonSidesInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        createPolygon();
        // Return focus to canvas context essentially
        polygonSidesInput.blur();
    }
});

function createPolygon() {
    let sides = parseInt(polygonSidesInput.value, 10);
    if (isNaN(sides) || sides < 3) sides = 3;
    if (sides > 20) sides = 20; // safety limit
    polygonSidesInput.value = sides;

    const radius = 60;
    const points = [];
    const angle = (Math.PI * 2) / sides;
    const offset = -Math.PI / 2; // Point upwards

    for (let i = 0; i < sides; i++) {
        points.push({
            x: radius * Math.cos(i * angle + offset),
            y: radius * Math.sin(i * angle + offset)
        });
    }

    const polygon = new fabric.Polygon(points, {
        ...getDefaultShapeStyle()
    });
    
    processNewShape(polygon);
}

// Grid background handling
const btnGrid = document.getElementById('btn-grid');
const gridSizeSlider = document.getElementById('grid-size');
const bgGroup = document.getElementById('bg-group');
let isGridActive = false;

btnGrid.addEventListener('click', () => {
    isGridActive = !isGridActive;
    
    if (isGridActive) {
        document.body.classList.add('show-grid');
        btnGrid.classList.add('active');
        bgGroup.classList.remove('grid-disabled');
        updateGridSize();
    } else {
        document.body.classList.remove('show-grid');
        btnGrid.classList.remove('active');
        bgGroup.classList.add('grid-disabled');
    }
    saveSettings();
});


gridSizeSlider.addEventListener('input', () => {
    updateGridSize();
    saveSettings();
});

function saveSettings() {
    const settings = {
        gridActive: isGridActive,
        gridSize: gridSizeSlider.value,
        toolbarHidden: toolbar.classList.contains('hidden')
    };
    localStorage.setItem('pizarraSettings', JSON.stringify(settings));
}

function loadSettings() {
    const saved = localStorage.getItem('pizarraSettings');
    if (!saved) return;
    
    try {
        const settings = JSON.parse(saved);
        
        // Restaurar Cuadrícula
        isGridActive = settings.gridActive;
        if (settings.gridSize) gridSizeSlider.value = settings.gridSize;
        
        if (isGridActive) {
            document.body.classList.add('show-grid');
            btnGrid.classList.add('active');
            bgGroup.classList.remove('grid-disabled');
        } else {
            document.body.classList.remove('show-grid');
            btnGrid.classList.remove('active');
            bgGroup.classList.add('grid-disabled');
        }
        updateGridSize(); // Actualizar siempre (etiqueta + fondo si aplica)
        
        // Restaurar Barra de Herramientas
        if (settings.toolbarHidden) {
            toolbar.classList.add('hidden');
        } else {
            toolbar.classList.remove('hidden');
        }
    } catch (e) {
        console.error("Error cargando configuración:", e);
    }
}


function updateGridSize() {
    const size = gridSizeSlider.value;
    const sizePx = size + 'px';
    
    // Actualizar el número al lado del slider
    const valueLabel = document.getElementById('grid-size-value');
    if (valueLabel) valueLabel.textContent = size;
    
    if (isGridActive) {
        document.body.style.backgroundSize = `${sizePx} ${sizePx}`;
    }
}

function snapToGrid(value) {
    if (!isGridActive) return value;
    const size = parseInt(gridSizeSlider.value, 10);
    return Math.round(value / size) * size;
}

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

// Enhanced UX - Customizing object selection styles globally
fabric.Object.prototype.set({
    transparentCorners: false,
    cornerColor: '#ffffff',
    cornerStrokeColor: '#6366f1',
    borderColor: '#6366f1',
    cornerSize: 10,
    padding: 8,
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
    let xOffset = 0;
    let yOffset = 0;

    handle.addEventListener("pointerdown", dragStart, false);
    document.addEventListener("pointerup", dragEnd, false);
    document.addEventListener("pointermove", drag, false);

    function dragStart(e) {
        if (e.target.closest('button')) return;

        // Fijar posición inicial basada en el estado actual
        const rect = element.getBoundingClientRect();
        initialX = e.clientX - rect.left;
        initialY = e.clientY - rect.top;

        active = true;
        
        // Preparar elemento para movimiento absoluto
        element.style.right = 'auto';
        element.style.bottom = 'auto';
        element.style.transform = 'none';
        element.style.margin = '0';
        element.style.zIndex = '1000'; // Traer al frente al arrastrar
    }

    function dragEnd() {
        active = false;
        element.style.zIndex = '10'; // Volver a z-index normal
    }

    function drag(e) {
        if (active) {
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

// Aplicar arrastre a otros widgets si fuera necesario, pero el de configuración se queda fijo
// makeDraggable(document.getElementById('btn-open-settings'), document.getElementById('btn-open-settings'));

