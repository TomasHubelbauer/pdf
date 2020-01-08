# PDF

[**DEMO**](https://tomashubelbauer.github.io/pdf)

Basic PDF parser whose functionality is limited at parsing out text and image bounding
rectangles.

## Running

Generate `demo.pdf` by running `chrome --headless --print-to-pdf="demo.pdf" demo.html`.

`npx serve .`

## To-Do

### Parse the ops and args streams from the PDF

https://en.wikipedia.org/wiki/PDF#File_structure

http://wwwimages.adobe.com/content/dam/Adobe/en/devnet/pdf/pdfs/pdf_reference_1-7.pdf
(last free and available version before ISO started selling the standard)

https://www.pdfexaminer.com
can be used to visualize the internal structure and cross-reference it with my code.

### Rip PDF.js for the subset of the rendering logic needed

`src/display/canvas.js`: `CanvasGraphics`

### Rewrite in Node / complement by a Node version later on

For now using the browser for `ArrayBuffer` and `DataView`.
