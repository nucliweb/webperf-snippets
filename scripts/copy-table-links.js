/* Convert an array to tab separated values */

copy($$('a').map(e => [e.href, e.text, e.rel].join('\t')).join('\n'))