# Terminal Output\Viewport

The Viewport class is responsible for manipulating the viewport (visible area) of the terminal.

## Instance

To use the Terminal's Output\Viewport class, you need to access the instance through the Output class:

```php
CLI::$Terminal->Output->Viewport;
```

## Settings

There are no additional settings for this class.

## Usage

### Panorama down

```php
panDown (int $lines = null) : Output
```

Used to scroll down to the Terminal window.

Example:

```php
$Viewport->panDown(lines: 5);
```

### Panorama up

```php
panUp (int $lines = null) : Output
```

Used to scroll up to Terminal window.

Example:

```php
$Viewport->panUp(lines: 3);
```

**Notes:**

Differences between pan down / up and mouse scrolling:

Assume that you use this method to perform a "pan down" (or scroll up) in terminal viewport. When this method is utilized, the Terminal moves the content of the window up, exposing a new empty area at the bottom of the window. This movement of the window creates the illusion that the Terminal content is moving down, but in reality, it is the window that is moving up. This allows the user to see the previous content that was hidden at the bottom of the window. This is the reason why the window movement up is sometimes called "pan down", even though the previous content is displayed at the top of the window.

It is important to note that this method does not scroll the content of the Terminal like scroll mouse. Instead, it moves the Terminal window up, revealing previous content that was hidden at the bottom of the window. If there is more content than the window can display, the older content may be lost as it is moved out of the window.

On the other hand, scrolling with the mouse allows the user to scroll the Terminal content up or down in a smooth and controlled manner. This allows the user to view all Terminal content, including older content that is out of the window.
