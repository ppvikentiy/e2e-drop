import Kw from './Kw.jsx';

// Renders an error string. Text inside [[double brackets]] is the fix:
// the simple theme underlines it, other themes show it as ordinary words.
export default function ErrorText({ text }) {
  const value = typeof text === 'string' ? text : '';
  if (!value) return null;
  const nodes = [];
  let last = 0;
  let n = 0;
  for (const match of value.matchAll(/\[\[(.+?)\]\]/g)) {
    if (match.index > last) nodes.push(value.slice(last, match.index));
    nodes.push(<Kw key={n++}>{match[1]}</Kw>);
    last = match.index + match[0].length;
  }
  if (last === 0) return value;
  if (last < value.length) nodes.push(value.slice(last));
  return nodes;
}
