/* Outline no follow links with a red border */

$$('a[rel*=nofollow]').forEach(e => e.style.outline = "2px red solid")