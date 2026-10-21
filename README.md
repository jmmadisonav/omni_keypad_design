# OMNI Keypad Designer

OMNI Keypad Designer is where you design button images for an OMNI keypad and
deploy them to it. It's a Windows desktop app with its own installer. Each
button gets an OFF and an ON image, and optionally an ALT image. You design
each of these states on its own. The images are 188x188 pixels on the 8BV and
150x150 on the 6B and 6BV; the designer renders them at the project's size, so
you lay out buttons the same way on every model.

Each state is built from four parts, drawn from back to front:

- **Background:** a base shape from `docs/Keypad Graphics.zip` (Squared,
  Bubble, or Circle 45) in any of its colours, or a colour of your own.
- **Image:** a PNG or SVG of your own, such as a logo. It fills the button and
  covers the background.
- **Icon:** any of more than 1,800 Lucide icons.
- **Text:** one or two lines in Titillium Web, Inter, Roboto, or Oswald.

For two lines of text in different places, a second icon, or several images,
switch the button to **Layers**.

The designer runs on your computer and doesn't need internet access.

The source code is on GitHub at
[jmmadisonav/omni_keypad_designer](https://github.com/jmmadisonav/omni_keypad_designer).

## Before you begin

You need a keypad that runs firmware 1.1.x on your network. Deploying uploads
the whole design, so it uses the same experimental method as Part 3 of the [OMNI Keypad example code](https://github.com/jmmadisonav/OMNI-Keypad-example-code) README.

## Start the designer

To start the designer, open **OMNI Keypad Designer** from the Start menu. The
app carries its own Python, so you don't need to install Python to use it. To
run it from source or build it, see [Build the desktop app](#build-the-desktop-app).

The app keeps projects, backups, and the recipe library in
`Documents\OMNI Keypad Designer`. To open that folder, click **File > Open Data
Folder**. To see the app's version, click **Help > About**; it's also at the
right of the status bar.

The menu bar has the usual Windows menus:

- **File:** **New Project** (Ctrl+N), **Open Project**, **Save** (Ctrl+S),
  **Save As** (Ctrl+Shift+S), **Open Data Folder**, and **Exit**.
- **Edit:** **Undo** (Ctrl+Z), **Redo** (Ctrl+Y), and **Cut**, **Copy**,
  **Paste**, and **Select All** for text fields.
- **View:** **Reload** (F5 or Ctrl+R), **Zoom In** (Ctrl+Plus), **Zoom Out**
  (Ctrl+Minus), **Actual Size** (Ctrl+0), and **Developer Tools** (F12 or Ctrl+Shift+I).
- **Keypad:** **Back Up Keypad Now**, **Backups**, and **Reset Keypad**, for
  the keypad whose IP address is in the header. See
  [Locate or reset a keypad](#locate-or-reset-a-keypad).
- **Help:** **User Guide** (F1), which opens the guide in your browser, and
  **About OMNI Keypad Designer**.

The user guide is `designer/guide/index.html`. It covers the same ground as
this README for people who use the app, without the developer sections. When
you change how the app works, update both.

If Windows doesn't let the app save to Documents, for example because Windows
Security's Controlled folder access is on, the app keeps your projects in
`%APPDATA%\OMNI Keypad Designer\Data` instead and tells you once. **Open Data
Folder** opens whichever folder is in use. If you later let the app and its
`python.exe` through Controlled folder access, it goes back to Documents, and
you can move anything you saved in the meantime across.

## Design and deploy buttons

1. The designer opens your most recent project, or a new project called
   "Untitled" the first time. To start another, click **File > New Project**, and choose its
   name and keypad model. To work on a keypad's current design, enter its IP
   address, or click **Scan**, and click **Import**. That saves the design as a
   new project named after the keypad, for example `172-17-0-55 2026-10-06`.
1. Click a button on the keypad view. Until you do, the keypad has the whole
   window. The **States** rail next to the keypad
   shows its OFF, ON, and ALT images. Click a state to edit it. The keypad
   shows that state on every button, and the **Button** tab shows that
   state's parts only. A button that wasn't made in the designer opens with
   its existing artwork in the Image part.
1. Turn parts on with their switches, and click a part to change it. Each
   state keeps its own settings, so ON can have a different icon, colour, or
   text from OFF. A part that differs from OFF is marked **≠ OFF**. To move
   the open part, drag it on the selected state in the rail, or change **X**
   and **Y**.

   To start from finished artwork, open the **Library** tab and pick a
   ready-made button. To rename the button, double-click its name at the top
   of the **Button** tab, type, and press Enter. Esc puts the old name back.

   A background uses a colour from Keypad Graphics. Most colours come as a dim
   and a bright picture: click the left half of a swatch for dim, or the right
   half for bright. You choose this for each state. Nothing changes it for you.
   To use your own colour instead, click **+** after the colour swatches, and
   pick **Dim** or **Bright**. The designer recolours the set's grey artwork,
   so the shape keeps its shading.

   New parts start the same in every state: a dim Blue background, and white
   icons and text.
1. To make another state match this one, click **Copy state** and choose a
   state. To copy this state, or every state, to another button, choose
   **Copy the {state} state to another button…** or **Copy all states to
   another button…**, and then click the button. You can switch pages first.
   The other button keeps its name and page link.
1. Repeat for other buttons and pages. A red square marks each changed button,
   and one next to the project name means there are unsaved changes.
1. Click **File > Save**, or press Ctrl+S. You don't need a keypad for any of these steps.
1. To put the project on a keypad, enter its IP address and click **Deploy**.
   The designer saves first if needed. The keypad restarts with the project
   in about 20 seconds.

To undo a change, press Ctrl+Z. To redo it, press Ctrl+Y or Ctrl+Shift+Z. You
can undo every change since you last saved or opened the project. In a text
field, Ctrl+Z undoes your typing in that field instead.

To swap two buttons, drag one onto the other. The artwork, the button name, and
the page link move. The control settings, such as the HControl path, stay with
each slot.

### The ALT state

Each button has a third state, ALT, next to OFF and ON. Your code sets it
over HControl with `"value":"Alt"` on the button's `state` path. Most designs
don't use it, so a button has no ALT state until you add one.

To give a button an ALT state, do the following:

1. Select the button, and click **+ Add ALT** in the States rail.
1. Click **Start from OFF**, **Start from ON**, or **Start blank**.
1. Change ALT's parts. They're separate from OFF and ON.

A button gets an ALT image on the keypad only once it has an ALT state, even
a blank one. To take a button's ALT image off the keypad, click **Remove ALT**
under its ALT image, and save. **Import** keeps the ALT images a keypad already
has.

### Layers

**Simple** shows one of each part. When a button needs more, such as two
text labels or a second icon, click **Layers** next to the button name.
Layers shows the state's layers in two groups:

- **Front** holds Text and Icon layers. They're see-through, so you can have
  any number in any order.
- **Back** holds Shape and Image layers. They're solid, and they always draw
  behind Front.

When one Back layer hides another, a warning explains what's hidden and
offers to delete the hidden layer or, for an image, to shrink it. You can
switch back to **Simple** when every state has at most one of each part.

### Projects from earlier versions

The designer only opens buttons made since the States rail, where each state
has its own layers. A button saved by an earlier version opens with the images
it has on the keypad, as an image layer in each state, and its old layers are
dropped. A library recipe from an earlier version can't be applied. To remove
it, delete it from the library.

### OMNI bindings and script references

A design made in AVX can bind controls to an OMNI device. A bound control
isn't available over HControl. When you open a project with bound controls, a
warning above the keypad says how many there are, and the **Page** tab lists
them by page and device. To use them over HControl, click **Remove OMNI
bindings** in the **Page** tab, save, and deploy. Removing the bindings leaves
page links and script references alone, and the dial and LED ring go back to
the keypad's own range. To undo it before you save, press Ctrl+Z.

A control can also use an AVX script reference, such as
`Category_1/Reference_1`. It's still available over HControl, but at the
reference's path instead of its page's path. For example, a dial on that
reference is at `/Category_1/Reference_1/level` instead of
`/page1/dial/level`. The **Page** tab lists each script reference. To move
the controls back to their page paths, for example for a third-party
controller, click **Remove script references**, save, and deploy. The ranges
stay as they are.

### Backups

Every deploy saves the design that was running as
`backups/backup_<date>_<time>.cpio` in the data folder, every **Import** saves
a copy as `loaded_<date>_<time>.cpio`, **Back up keypad now** in **Keypad > Backups**
saves `manual_<date>_<time>.cpio`, and **Reset Keypad** saves
`reset_<date>_<time>.cpio` unless you clear its checkbox. If a deploy fails
after its backup, the designer offers to restore that backup.

To put a design back, click **Keypad > Backups**, choose a backup, and click
**Restore**. Restoring works even when the keypad has no design loaded.

A keypad with no design, for example after a factory reset, doesn't need a
backup: **Deploy** checks for a design for about 15 seconds, then uploads the
project anyway.

If the keypad has a different design from the one this project last loaded
from or deployed to, the designer asks before it replaces it.

### Locate or reset a keypad

To see which keypad has the IP address in the header, click **Locate**. The
keypad's LED ring cycles for about 8 minutes, the same as Locate in AVX. To
stop it sooner, click **Stop locating**. The button changes back by itself
when the keypad stops.

To reset a keypad to its default settings, click **Keypad > Reset Keypad**.
The keypad keeps its firmware version.
The designer asks first, and backs up the keypad's design unless you clear
**Back up the keypad's design first**. The keypad loses its design and
restarts. If it had a fixed IP address, it might come back with another one;
to find it, click **Scan**. To put the design back, deploy a project or
restore the backup.

Both use HControl: Locate sends `locate` with the keypad's guid, MAC address,
name, and a timeout in seconds (0 stops it), as captured from AVX. Reset Keypad
runs `/configuration/commands/reset` with `level` set to `System`. The
`Factory` level also rolls the firmware back to the version the keypad shipped
with, so the designer doesn't use it.

## Add pages and switch between them

The page tabs above the keypad view show the design's pages. To change the
pages, use the tabs:

- To add a page, click **+ Page**. A new page has page 1's dial and LED ring
  settings and no button images. A design can have up to 9 pages.
- To rename a page, double-click its tab. Page names must be unique. Buttons
  that switch to the page keep switching to it.
- To delete the current page, click **×** on its tab. Buttons that switch to
  it stop switching pages.

To show another page while you drag a button, drag it over that page's tab.

To make a button switch pages, select the button, and then choose a page in
**Go to page**. The keypad switches pages by itself, without any app running.
A badge such as **→ Lights** marks each button that switches pages.

Page changes are saved with the project, and go to the keypad when you
deploy it.

**Note:** HControl paths use page numbers, such as `/page3/button1/action`.
Adding a page only adds new numbers. Deleting a page moves the pages after it
up one number, so update any app that uses their paths.

## Keypad models

The designer supports these OMNI keypads:

| Model | Tabletop version | Buttons on the wall unit | Buttons on the tabletop | Dial and LED ring |
|---|---|---|---|---|
| OMNI-KP-6B | OMNI-KP-T6B | 2 columns, 3 rows | 3 columns, 2 rows | No |
| OMNI-KP-6BV | OMNI-KP-T6BV | 2 columns, 3 rows | 3 columns, 2 rows | Yes |
| OMNI-KP-8BV | OMNI-KP-T8BV | 4 columns, 2 rows | 4 columns, 2 rows | Yes |
| OMNI-KP-V | None | None | None | Yes |

Buttons are numbered along the top row first, then the next row.

The OMNI-KP-V has a knob and LED ring, with no buttons or screen. A KP-V
project has one page, and you set its dial and LED ring ranges on the
**Page** tab.

Each project is for one model. To choose it, click **File > New Project** and pick the
model. **Import** uses the model the keypad reports. You can't change a
project's model later. The model appears just above the keypad view.

A tabletop keypad is the same model as its wall unit. A project for the
OMNI-KP-8BV loads from and deploys to an OMNI-KP-T8BV, and the other way
around. Importing from a tabletop keypad makes a project for its wall-unit
model, with the tabletop housing.

### Housing and finish

Under the keypad view, two controls set how the keypad looks:

- **Wall | Tabletop** sets the housing. The tabletop T6B and T6BV turn the
  screen sideways, so their buttons are 3 across. Choose it in **New Project**, or
  change it any time.
- **Black | White** sets the finish, such as OMNI-KP-T8BV-BL or -WH. It only
  changes the preview.

The housing and finish are saved with the project straight away.

### Keypad and page settings

The sidebar's **Keypad** tab holds settings for every page, and its **Page**
tab holds settings for the page you're viewing. Opening either tab deselects
the selected button. When no button is selected, the sidebar shows the
**Page** tab. These settings are part of the design: they're saved with the
project, deployed, and undone with Ctrl+Z.

On the **Keypad** tab, **Lines** sets the colour of the lines between
buttons. New projects use black. A project imported from a keypad keeps the
keypad's colour.

On the **Page** tab:

- **Background** sets the page's background colour. The keypad shows it as a
  thin border around the outside of the buttons, and behind blank buttons and
  the transparent parts of button images. A page you add starts with page 1's
  colour. A page with no colour uses black.
- **Dial range** and **LED ring range** set the lowest and highest level of
  the dial and the LED ring, separately. Use whole numbers; they can be
  negative. To use the keypad's own range, 0 to 200, leave both boxes blank.
  New projects and new pages start blank. These settings only appear on
  models with a dial.
- **Bindings on this page** lists controls that are bound to an OMNI device
  or use a script reference.
- **Remove OMNI bindings** and **Remove script references** appear when the
  design has them, and apply to every page. For details, see
  [OMNI bindings and script references](#omni-bindings-and-script-references).

If a project's model file is missing, the designer shows an error. You can
still edit the project, but you can't deploy it until you put the model file
back.

The 6B and 6BV are marked "untested": their templates follow AVX
Architect's 6B and 6BV designs, but haven't been deployed to a real unit
yet.

**Deploy** checks the keypad's model first. If it isn't the project's model,
nothing is uploaded.

Each model is a file in `designer/models/`. If a real keypad's design differs
from a model's template, change the template in that file. A model file's
`aliases` list the other model IDs a keypad can report for the same hardware,
such as its tabletop version. The designer checks the files when it starts,
and names any file that's wrong.

## Projects

Each project is a folder in `designer/projects/`:

| File | Contains |
|---|---|
| `keypad.json` | The design, in the same format as the example code's [`design/`](https://github.com/jmmadisonav/OMNI-Keypad-example-code/tree/main/design) folder |
| `images/` | The button images the design uses |
| `designer.json` | Each button's layers, which keypad design the project last matched, and when it was last deployed |

To open a project, click **File > Open Project** and choose it. To keep a copy
under another name, click **File > Save As**. To delete a project, delete its folder.

## Reuse designs with the library

To keep a button's layers so you can change them later, click **Save to
library** and give it a name. Recipes are saved in `designer/library/`. To use
a recipe, open the **Library** tab, and then click the recipe to apply it to
the selected button, or drag it onto any button. Applying a recipe replaces
the button's layers and name, and keeps its page link.

The recipe name also names the image files on the keypad, for example
`HDMI_1_OFF.png`. Buttons that use the same recipe share the same files. To
change the file names for one button, double-click its name and rename it.

**Ready-made** shows the finished buttons in `Keypad Graphics.zip`.

## Program the keypad from your own code

The **HControl** drawer under the keypad view shows the strings your own code
sends to the keypad and the replies to expect. To see them for a button,
select the button. The strings cover that button's page and button numbers: subscribing to
presses, getting and setting the feedback state, and enabling or disabling the
button. A button with a page link also shows how to follow page changes, and
models with a dial show the dial and LED ring paths. The **Notes** pane
explains the protocol rules.

- To copy one line, point to it and click the copy button.
- To copy every line, click **Copy all**. Each line starts with `->` for a
  line you send or `<-` for one you receive.
- To resize the drawer, drag its top edge. To hide or show it, click the
  selected tab.

If you've added or deleted pages since you last saved, the drawer warns you
that the page numbers can change when you save and deploy.

### Try a design on the keypad

The **Debug** tab in the drawer connects to the keypad and answers it the
way a simple control system would, so you can check a deployed design by
hand. It doesn't need a project open.

1. Enter the keypad's IP address in the header, or click **Scan**.
2. Click the **Debug** tab, and then click **Connect**.
3. Press buttons and turn the dial on the keypad.

While you're connected, pressing a button switches it between OFF and ON,
and turning the dial sets the LED ring on the same page to the dial's level.
The log shows every line sent (`→`) and received (`←`), plus notes such as
`Page 1 dial: 40`. A green dot on the **Debug** tab shows that you're
connected.

When you connect, the log warns you about controls the keypad doesn't make
available, page by page. They might be bound to an OMNI device. To check,
import the design: the project warning names the device. A dial that uses a
script reference is found at the reference's path, and the log shows its
turns as `Dial on Category_1/Reference_1: 40`. Debug doesn't copy those to an
LED ring. Deploying a design closes the connection. To start again, click
**Connect**.

## Build the desktop app

The desktop app is an Electron window around the designer. It starts
`designer/server.py` with a bundled copy of Python's embeddable runtime,
and shows the page the server serves. Its code is in `electron/`, and
its release scripts are in `build_tools/`, following the BSS Commission app.

### Before you begin

- Node.js 22 or later.
- To run the app from source: Python 3.10 or later.
- The Node dependencies: run `npm install` from the repository folder.
- To sign a release: the code-signing certificate at
  `%OneDriveCommercial%\WindowSigningCert\MyKey.pfx`, and a `.env` file at the
  repository root with `SIGNING_PASSWORD` set to its password. To make one,
  copy `.env.example` to `.env`. `.env` is ignored by git; never commit it.

The first build downloads Python's embeddable runtime from python.org and
keeps it in `build/cache/`. To use another Python version, change
`PYTHON_VERSION` in `build_tools/stage-python.mjs`.

### Run and build

- To run the app from source, run `npm run electron`. It uses the Python on
  your PATH, or the one the `OMNI_PYTHON` environment variable names.
- To build the app without an installer, run `npm run package`. The app is
  in `output/win-unpacked/`.
- To build an unsigned installer, run `npm run installer`. The installer is
  `output/omni_keypad_designer_setup_v<version>.exe`.

To try a build without touching your own projects and settings, or alongside an
installed copy, set
`OMNI_KEYPAD_DATA_DIR` to another folder before you start the app.

### What the installer does

- Shows the MIT licence (`LICENSE`) and asks you to accept it before it
  installs anything. A copy is installed next to the app as `LICENSE.txt`.
- Asks whether to install for everyone on the computer (needs admin) or just
  the current user, and lets you change the install folder.
- Adds a Start menu shortcut, **OMNI Keypad Designer**. There's no desktop
  shortcut.
- Offers to start the app when it finishes, and adds the app to Windows'
  installed apps, with an uninstaller.

### Licensing

The app is licensed like every Magic Software app: at startup it checks in
with the license server as `omni_keypad_designer`, and keeps its license in
`HKCU\SOFTWARE\Magic Software\OMNI Keypad Designer`. If the server requires a
serial number, the app asks for one, and it supports manual activation when
the server can't be reached. The server decides whether a serial is required;
to require one even before the server first answers, set `ENFORCE_SERIAL` in
`electron/main.ts`.

The check-in is also the update check: if the server reports a newer version,
the app offers to open its download page.

### Cut a release

To build a signed release, run:

```
npm run release -- <version>
```

For example, `npm run release -- 0.2.0`. The script bumps the version in
`package.json`, opens `output/release_notes.txt` for you to fill in, builds
and signs the app and its installer, and zips the installer with the release
notes as `output/OMNI_Keypad_Designer_<version>.zip`. To preview the steps
without changing anything, add `--dry-run`.

The release signs the app, its installer, and its uninstaller. The bundled
`python.exe` and `pythonw.exe` keep the Python Software Foundation's own
signature: `build_tools/sign.cjs` stops electron-builder from replacing it
with yours.

The script doesn't touch git. Afterwards, commit, tag, and push the release,
and then publish it to GitHub Releases:

```
git tag v<version>
git push origin v<version>
npm run release:publish -- <version>
```

Publishing needs the [GitHub CLI](https://cli.github.com/), signed in with
`gh auth login`.

## Code shared with the example code

The designer started in the [OMNI Keypad example code](https://github.com/jmmadisonav/OMNI-Keypad-example-code) repo, and uses
two of its modules, copied into this repo:

| File | What the designer uses it for |
|---|---|
| `hcontrol.py` | The HControl client: talking to keypads, and finding them on the network |
| `keypad_design.py` | Reading and writing keypad designs (`project.cpio`) |

The copies change independently. When you fix a bug in one of these files,
check whether the other repo needs the same fix.

## Run the tests

To run the Python tests, run `python -m unittest discover -s tests -t .`.

To run the JavaScript tests, you need Node.js 18 or later. Run
`npm run test:designer` for the designer page, and `npm test` for the desktop
app and its build scripts.

## Check on a real keypad

To check the designer against a keypad, do the following:

1. Click **Import**, and check that the keypad view matches the keypad's
   screen: the same images in the same positions, on the same page.
1. Edit button 1 with a shape, an icon, and text, and button 2 with an image.
1. Deploy, and check both buttons on the keypad in both states. To switch a
   button to ON, run `python 01_buttons_dial_feedback.py` and press it.
1. Click **Import** again, and check that the designer shows the deployed images.
1. In **Keypad > Backups**, restore the backup, and check that the keypad shows the original design.
