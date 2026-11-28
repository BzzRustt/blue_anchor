/**
 * Facts shown on the legal pages. One place to edit.
 * `operator`: the legal name and registered address of whoever runs ScanMe (a company or sole trader).
 * `icoNumber`: the ICO data protection registration number. Both are rendered only when filled in,
 * so the pages never show a placeholder. UK controllers who process personal data normally must
 * register with the ICO and pay the data protection fee: fill these in before launch.
 */
export const LEGAL = {
  product: 'ScanMe',
  operator: '' as string,
  icoNumber: '' as string,
  contactEmail: 'hello@scanme.app',
  lastUpdated: '28 November 2026',
  minimumAge: 16,
}
