# Unscript

A JavaScript-based solution for importing, exporting, and viewing screenplays. It's designed to be reliable, lightweight, and extensible.

You can use it here: [Unscript](https://zachlo.com/unscript)

Unscript currently supports the following formats to some extent:

### Import

- Fade In
- Final Draft
- Fountain
- Highland
- Open Screenplay Format
- PDF

### Export

- ePub
- Final Draft
- Fountain
- Open Screenplay Format

## Components

### Script

A JavaScript class that represents a single screenplay. It is made up of a title page object (which holds the title, authors, and other metadata about the script) and an ordered list of script elements.

I view a screenplay as an ordered list of semantically meaningful parts. Each of these is a ScriptElement, an object with a type (e.g. action, scene heading, transition), which is in turn made up of an ordered list of text elements. Each text element contains a string and a set of styles. This allows text with different styles to be nested in the same script element; for example:

    The writer flips his desk. **CRASH!**

Each of these objects also contains a method to convert it to HTML. This is contained in the Script object, rather than the ScriptWriter object, because I understand it as a format of viewing and representing the script, rather than a format for editing.

### ScriptReader

A JavaScript class that contains all the methods for converting an input file into a Script object.

### ScriptWriter

A JavaScript class that contains all the methods for converting an input Script object into an output file.

## Usage

To use an existing import or export method, simply create a new ScriptReader or ScriptWriter object and call the readFile or writeFile method.

## License

All of this code is provided under a permissive MIT license.

## Credits

Unscript uses the [Fountain](https://fountain.io) format and the [Open Screenplay Format](https://github.com/OpenScreenplayFormat/osf-sdk).

The Fountain parsing code is based heavily on Nima Yousefi's [Fast Fountain Parser](https://github.com/nyousefi/Fountain).

***

Zach Lo

<https://zachlo.com>
