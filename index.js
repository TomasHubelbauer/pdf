window.addEventListener('load', () => {
  const fileInput = document.getElementById('fileInput');
  const uploadButton = document.getElementById('uploadButton');
  const demoButton = document.getElementById('demoButton');
  const contentDiv = document.getElementById('contentDiv');

  function renderPdf(/** @type {Pdf} */ pdf) {
    console.dir(pdf);

    contentDiv.innerHTML = '';

    const objectSelect = document.createElement('select');
    objectSelect.size = 10;

    for (const object of pdf.objects) {
      const objectOption = document.createElement('option');
      objectOption.value = object.number;
      if (object.stream) {
        if (object.content['Subtype']) {
          const subtype = object.content['Subtype'].slice(1);
          switch (subtype) {
            case 'Image': {
              const dimensions = `${object.content['Width']}x${object.content['Height']}`;
              switch (object.content['Filter']) {
                case '/FlateDecode': {
                  objectOption.textContent = `${object.number} (${dimensions} PNG)`;
                  break;
                }
                case '/DCTDecode': {
                  objectOption.textContent = `${object.number} (${dimensions} JPG)`;
                  break;
                }
                default: {
                  objectOption.textContent = `${object.number} (${dimensions} image)`;
                }
              }

              break;
            }
            case 'XML': {
              objectOption.textContent = `${object.number} (XML)`;
            }
            case 'Form': {
              objectOption.textContent = `${object.number} (form)`;
              break;
            }
            default: {
              objectOption.textContent = `${object.number} (stream)`;
            }
          }
        }
        else {
          objectOption.textContent = object.number + ' (stream)';
        }
      }
      else if (object.content['Type'] === '/Font') {
        objectOption.textContent = object.number + ' (font)';
      }
      else {
        objectOption.textContent = object.number;
      }

      objectSelect.append(objectOption);
    }

    contentDiv.append(objectSelect);

    const objectPre = document.createElement('pre');
    contentDiv.append(objectPre);

    const streamPre = document.createElement('pre');
    contentDiv.append(streamPre);

    const renderImg = document.createElement('img');
    contentDiv.append(renderImg);

    objectSelect.addEventListener('change', () => {
      const object = pdf.objects.find(o => o.number === objectSelect.value);
      const { stream, ...rest } = object;
      objectPre.textContent = JSON.stringify(rest, null, 2);
      streamPre.textContent = '';
      if (renderImg.src && renderImg.src.startsWith('blob:')) {
        URL.revokeObjectURL(renderImg.src);
      }

      if (typeof object.content === 'object' && object.stream) {
        renderImg.className = 'hidden';
        // TODO: Check for ColorSpace=DeviceRGB format instead of assuming it
        // TODO: Handle ColorSpace=DeviceGray in the PNG case
        // TODO: Figure out how to handle DeviceGray and DeviceCMYK in the JPG case
        if (object.content['Subtype'] === '/Image') {
          switch (object.content['Filter']) {
            case '/FlateDecode': {
              /** @type {Uint8Array} */
              const uint8Array = UZIP.inflate(new Uint8Array(object.stream.data));
              const width = Number(object.content['Width']);
              const height = Number(object.content['Height']);
              if (width * height * 3 === uint8Array.byteLength) {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                for (let x = 0; x < width; x++) {
                  for (let y = 0; y < height; y++) {
                    const offset = y * width * 3 + x * 3;
                    const r = uint8Array[offset];
                    const g = uint8Array[offset + 1];
                    const b = uint8Array[offset + 2];
                    context.fillStyle = `rgb(${r}, ${g}, ${b})`;
                    context.fillRect(x, y, 1, 1);
                  }
                }

                renderImg.className = '';
                renderImg.src = canvas.toDataURL();
              }
              else {
                throw new Error('Invalid RGB array length');
              }

              break;
            }
            case '/DCTDecode': {
              const blob = new Blob([object.stream.data], { type: 'image/jpg' });
              renderImg.className = '';
              renderImg.src = URL.createObjectURL(blob);
              break;
            }
            default: {
              streamPre.textContent += '\n' + new TextDecoder().decode(object.stream.data.slice(0, 1000)) + '…';
            }
          }
        }
        else {
          switch (object.content['Filter']) {
            case '/FlateDecode': {
              /** @type {Uint8Array} */
              const uint8Array = UZIP.inflate(new Uint8Array(object.stream.data));
              streamPre.textContent += '\n' + new TextDecoder().decode(uint8Array.slice(0, 1000)) + '…';
              break;
            }
            default: {
              streamPre.textContent += '\n' + new TextDecoder().decode(object.stream.data.slice(0, 1000)) + '…';
            }
          }
        }
      }
    });
  }

  uploadButton.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', event => {
    if (event.currentTarget.files.length === 0) {
      return;
    }

    if (event.currentTarget.files.length > 1) {
      alert('Please select only one file at a time.');
      return;
    }

    const file = event.currentTarget.files[0];
    const fileReader = new FileReader();
    fileReader.readAsArrayBuffer(file);
    fileReader.addEventListener('load', () => renderPdf(new Pdf(fileReader.result, file.name)));
    fileReader.addEventListener('error', () => alert('Failed to load the file.'));
  });

  demoButton.addEventListener('click', async () => {
    const response = await fetch('demo.pdf');
    const arrayBuffer = await response.arrayBuffer();
    renderPdf(new Pdf(arrayBuffer));
  });

  // Load a file if it is prefilled by the browser from the last session
  if (fileInput.value) {
    fileInput.dispatchEvent(new Event('change'));
  }
  else {
    demoButton.click();
  }
});

class Pdf {
  constructor(/** @type {ArrayBuffer} */ arrayBuffer, /** @type {string} */ name) {
    this.name = name;

    const textDecoder = new TextDecoder();

    let cursor = 0;
    function shift(byteCount = 1) {
      const _cursor = cursor;
      cursor += byteCount;
      return _cursor;
    }

    function pop(byteCount = 1) {
      return textDecoder.decode(arrayBuffer.slice(shift(byteCount), cursor));
    }

    function peek(byteCount = 1) {
      return textDecoder.decode(arrayBuffer.slice(cursor, cursor + byteCount));
    }

    const header = pop(7);
    if (header !== '%PDF-1.') {
      throw new Error('The file header is not a valid PDF header.');
    }

    const version = pop();
    if (version <= '0' || version >= '7') {
      throw new Error(`The PDF is version ${version}, only 7 is supported at the moment.`);
    }

    if (peek() === '\n' || peek() == '\r') {
      shift();
    }
    else {
      throw new Error('The header does not end with a newline.');
    }

    this.version = '1.' + version;

    // Read the recommended comment marking the file as binary if present
    if (peek() === '%') {
      let newline;
      do {
        // Ignore the comment bytes
      }
      while ((newline = peek(), pop(), newline !== '\r' && newline !== '\n'));
    }

    function consumeWhitespace() {
      let consumed = '';
      let peeked = '';
      while ((peeked = peek(), peeked === ' ' || peeked === '\r' || peeked === '\n')) {
        consumed += peeked;
        shift();
      }

      return consumed;
    }

    function expectLiteral(literal) {
      const peeked = peek(literal.length);
      if (peeked !== literal) {
        throw new Error(`Expected literal '${literal}' not found! '${peeked}'`);
      }

      shift(literal.length);
    }

    function expectNewline() {
      if (peek() === '\r') {
        shift();
        if (peek() === '\n') {
          shift();
        }

        return;
      }

      if (peek() === '\n') {
        shift();
        return;
      }

      throw new Error(`Expected newline not found! '${peeked}'`);
    }

    function consumeMatch(regex) {
      let consumed = '';
      let peeked;
      while (regex.exec(peeked = peek())) {
        consumed += peeked;
        shift();
      }

      return consumed;
    }

    function consumePrior(literal) {
      let comsumed = '';
      while (peek(literal.length) !== literal) {
        comsumed += pop();
      }

      shift(literal.length);
      return comsumed;
    }

    function follows(literal) {
      const peeked = peek(literal.length);
      if (peeked === literal) {
        shift(literal.length);
        return true;
      }

      return false;
    }

    function parseValue() {
      if (peek(2) === '<<') {
        return parseDictionary();
      }

      if (peek() === '[') {
        return parseArray();
      }

      let value = '';
      do {
        let peeked = peek();
        while ((peeked = peek(), peeked !== ' ' && peeked !== '\r' && peeked !== '\n') && peek(2) !== '>>') {
          value += pop();
        }

        const whitespace = consumeWhitespace();
        if (peek(2) === '>>' || peek() === '/' || peek(2) === '<<' || peek(2) === '[') {
          break;
        }
        else {
          value += whitespace;
        }
      }
      while (true);

      return value;
    }

    function parseArray() {
      expectLiteral('[');
      let depth = 1;
      let value = '';
      do {
        const popped = pop();
        switch (popped) {
          case '[': {
            depth++;
            continue;
          }
          case ']': {
            depth--;
            continue;
          }
        }

        value += popped;
      }
      while (depth);

      return value.split(' ');
    }

    function parseDictionary() {
      expectLiteral('<<');

      const dict = {};
      let key;
      while (true) {
        consumeWhitespace();
        if (!key) {
          if (follows('>>')) {
            break;
          }

          expectLiteral('/');
          key = consumeMatch(/\w/);
        }
        else {
          dict[key] = parseValue();
          key = undefined;
        }
      }

      return dict;
    }

    this.objects = [];
    while (peek(4) !== 'xref') {
      const object = {};
      object.number = consumePrior(' ');
      object.generation = consumePrior(' ');
      expectLiteral('obj');
      expectNewline();
      object.content = parseValue();
      consumeWhitespace();

      if (peek(6) === 'stream') {
        object.stream = {};

        shift(6);
        expectNewline();

        if (typeof object.content !== 'object') {
          throw new Error('Object has stream but its content is not a dictionary');
        }

        const length = Number(object.content['Length']);
        if (!length) {
          throw new Error('Stream with no length attribute encountered!');
        }

        object.stream.data = arrayBuffer.slice(cursor, cursor + length);

        shift(length);
        expectNewline();
        expectLiteral('endstream');
        expectNewline();
      }

      expectLiteral('endobj');
      expectNewline();

      this.objects.push(object);
    }

    expectLiteral('xref');
    expectNewline();
    this.xrefNumber = consumePrior(' ');
    this.xrefGeneration = consumeMatch(/\d/);
    expectNewline();

    this.xrefs = [];
    let match;
    // TODO: Use named groups when supported by Firefox
    while (match = /^(\d{10}) (\d{5}) ([fn])$/g.exec(peek(18))) {
      shift(20);
      const [_, todo1, todo2, todo3] = match;

      // TODO: Parse the right fields for the xrefs
      this.xrefs.push({ todo1, todo2, todo3 });
      consumeWhitespace();
    }

    expectLiteral('trailer');
    expectNewline();
    consumeWhitespace();
    this.trailerDict = parseDictionary();
    expectNewline();
    expectLiteral('startxref');
    expectNewline();
    this.startXref = consumeMatch(/\d/);
    expectNewline();
    expectLiteral('%%EOF');
    consumeWhitespace();

    if (cursor !== arrayBuffer.byteLength) {
      throw new Error('Found garbage at the end of the PDF.');
    }
  }
}
