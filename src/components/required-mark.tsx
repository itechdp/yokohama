// Red asterisk after a field label — the field must be filled in before
// the form can be saved/confirmed.
export default function RequiredMark() {
  return (
    <span className="text-danger" aria-hidden="true">
      {" "}*
    </span>
  );
}
