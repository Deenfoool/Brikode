const cloudButton = document.querySelector("#cloudButton");
const cloudDialog = document.querySelector("#cloudDialog");
const builderButton = document.querySelector("#builderButton");
const status = document.querySelector("#status");

cloudButton?.addEventListener("click", () => {
  if (typeof cloudDialog?.showModal === "function") {
    cloudDialog.showModal();
  }
});

builderButton?.addEventListener("click", () => {
  status.textContent =
    "Builder is the next roadmap milestone. The Pages shell is live first so the editor can grow on a stable foundation.";
  status.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
