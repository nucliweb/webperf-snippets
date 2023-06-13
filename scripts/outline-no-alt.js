/* Outline images without alt tags with a red borer*/

$$('img:not([alt])').forEach(e => e.style.outline = "2px solid red")