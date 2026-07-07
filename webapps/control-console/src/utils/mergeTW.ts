export default function mergeTW(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}
