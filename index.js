window.addEventListener('load', () => {
  const fileInput = document.getElementById('fileInput');
  const uploadButton = document.getElementById('uploadButton');
  const demoButton = document.getElementById('demoButton');
  const contentDiv = document.getElementById('contentDiv');

  function renderPdf(/** @type {Pdf} */ pdf) {
    contentDiv.innerHTML = '';

    console.dir(pdf);

    for (const object of pdf.objects) {
      if (!object.stream) {
        continue;
      }

      if (object.attributes['Subtype'] !== '/Image') {
        continue;
      }

      const width = Number(object.attributes['Width']);
      const height = Number(object.attributes['Height']);
      if (width * height * 3 !== object.stream.byteLength) {
        throw new Error('Stream does not appear to be a raw RGB array.');
      }

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          const offset = y * width * 3 + x * 3;
          const r = object.stream[offset];
          const g = object.stream[offset + 1];
          const b = object.stream[offset + 2];
          context.fillStyle = `rgb(${r}, ${g}, ${b})`;
          context.fillRect(x, y, 1, 1);
        }
      }

      const img = document.createElement('img');
      img.src = canvas.toDataURL();
      contentDiv.append(img);
    }
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

    const fileReader = new FileReader();
    fileReader.readAsArrayBuffer(event.currentTarget.files[0]);
    fileReader.addEventListener('load', () => renderPdf(new Pdf(fileReader.result)));
    fileReader.addEventListener('error', () => alert('Failed to load the file.'));
  });

  demoButton.addEventListener('click', async () => {
    const response = await fetch('demo.pdf');
    const arrayBuffer = await response.arrayBuffer();
    renderPdf(new Pdf(arrayBuffer));
  });
});

class Pdf {
  constructor(/** @type {ArrayBuffer} */ arrayBuffer) {
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

    if (pop() !== '\n') {
      throw new Error('The header does not end with a newline.');
    }

    this.version = '1.' + version;

    // Read the recommended comment marking the file as binary if present
    if (peek() === '%') {
      do {
        // Ignore the comment bytes
      }
      while (pop() !== '\n');
    }

    function parseDictionary() {
      if (peek(2) !== '<<') {
        throw new Error('Dictionary opening expected but not found!');
      }

      pop(2);

      const dict = {};
      while (true) {
        if (peek() !== '/') {
          throw new Error('Dictionary key opening expected but not found!');
        }

        // Pop the key slash
        pop();

        let key = '';
        while (peek() !== ' ') {
          key += pop();
        }

        // Pop the space after key
        pop();

        let peeked;
        if (peek(2) === '<<') {
          dict[key] = parseDictionary();
          peeked = peek(2);
        }
        else {
          let value = '';

          while ((peeked = peek(2)) !== '\n/' && peeked !== '>>') {
            value += pop();
          }

          dict[key] = value;
        }

        // Pop the closing and end the dictionary
        if (peeked === '>>') {
          pop(2);
          break;
        }

        // Pop the newline after value
        pop();
      }

      return dict;
    }

    this.objects = [];
    while (peek(4) !== 'xref') {
      let number = '';
      while (peek() !== ' ') {
        number += pop();
      }

      // Pop the space after number
      shift();

      let generation = '';
      while (peek() !== ' ') {
        generation += pop();
      }

      // Pop the space after generation
      shift();

      if (pop(4) !== 'obj\n') {
        throw new Error(`The object number and generation was not followed by the 'obj\\n' constant.`);
      }

      const attributes = parseDictionary();

      let stream;
      if (peek(8) === ' stream\n') {
        shift(8);

        const attribute = attributes['Length'];
        if (!attribute) {
          throw new Error('Stream with no length attribute encountered!');
        }

        const length = Number(attributes['Length']);
        const filter = attributes['Filter'];
        if (filter === '/FlateDecode') {
          stream = UZIP.inflate(new Uint8Array(arrayBuffer.slice(cursor, cursor + length)));
        }
        else {
          throw new Error('Found a stream with unsupported encoding: ' + filter);
        }

        shift(length);

        if (pop(11) !== '\nendstream\n') {
          throw new Error(`The stream was not followed by the '\\nendstream\\n' constant.`);
        }
      }
      else {
        if (peek() !== '\n') {
          throw new Error('Object attributes were not followed by a newline!');
        }

        // Pop the newline after object attributes
        shift();
      }

      if (pop(7) !== 'endobj\n') {
        throw new Error(`The object attributes were not followed by the 'endobj\\n' constant.`);
      }

      this.objects.push({ number, generation, attributes, stream });
    }

    if (peek(5) !== 'xref\n') {
      throw new Error('XRef segment not found.');
    }

    shift(5);

    let xrefNumber = '';
    while (peek() !== ' ') {
      xrefNumber += pop();
    }

    // Pop the space after number
    shift();

    this.xrefNumber = xrefNumber;

    let xrefGeneration = '';
    while (peek() !== '\n') {
      xrefGeneration += pop();
    }

    // Pop the newline after generation
    shift();

    this.xrefGeneration = xrefGeneration;

    this.xrefs = [];
    let match;
    // TODO: Use named groups when supported by Firefox
    while (match = /^(\d{10}) (\d{5}) ([fn]) \n$/g.exec(peek(20))) {
      shift(20);
      const [_, todo1, todo2, todo3] = match;

      // TODO: Parse the right fields for the xrefs
      this.xrefs.push({ todo1, todo2, todo3 });
    }

    if (pop(8) !== 'trailer\n') {
      throw new Error('Trailer segment not found.');
    }

    this.trailerDict = parseDictionary();

    if (pop(11) !== '\nstartxref\n') {
      throw new Error('StartXRef segment not found.');
    }

    let startXref = '';
    while (peek() !== '\n') {
      startXref += pop();
    }

    // Pop the newline after start xref
    shift();

    this.startXref = startXref;

    if (pop(5) !== '%%EOF') {
      throw new Error('EOF segment not found.');
    }

    if (cursor !== arrayBuffer.byteLength) {
      throw new Error('Found garbage at the end of the PDF.');
    }
  }
}
