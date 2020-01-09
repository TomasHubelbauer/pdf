# PDF

[**DEMO**](https://tomashubelbauer.github.io/pdf)

Basic PDF parser whose functionality is limited at parsing out text and image bounding
rectangles.

## Running

Generate `demo.pdf` by running `chrome --headless --print-to-pdf="demo.pdf" demo.html`.

`npx serve .`

## To-Do

### Find entry object and parse the ops and args from the text stream

https://skia.org/dev/design/pdftheory

https://en.wikipedia.org/wiki/PDF#File_structure

http://wwwimages.adobe.com/content/dam/Adobe/en/devnet/pdf/pdfs/pdf_reference_1-7.pdf
(last free and available version before ISO started selling the standard)

https://www.pdfexaminer.com
can be used to visualize the internal structure and cross-reference it with my code.

### Rip PDF.js for the subset of the rendering logic needed

`src/display/canvas.js`: `CanvasGraphics`

### Rewrite in Node / complement by a Node version later on

For now using the browser for `ArrayBuffer` and `DataView`.

### Figure out parsing pages and their objects

https://wiki.tcl-lang.org/page/Parsing+PDF might have info on this.

### Improve parsing values

https://skia.org/dev/design/pdftheory

Be stricter about allowed value formats.

### Fix XRef table second number to be count and not generation

Ensure the number of entries is equal to the count by using a for loop and then
expecting the trailer.

### Parse dictionaries where keys are immediately followed by values

For this, a proper formatting of values needs to be implemented first, so that
things like names and strings do not get interrupted by otherwise significant
characters and the slash can be used as a stop character when parsing the value.
