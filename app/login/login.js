let isSignUp = true;

const authForm = document.getElementById("authForm");
const toggleMode = document.getElementById("toggleMode");
const submitBtn = document.getElementById("submitBtn");
const status = document.getElementById("status");
const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const phoneInput = document.getElementById("phone");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");

function getUsers(){
  const primary = JSON.parse(localStorage.getItem("iptvUsers") || "{}");
  const backup = JSON.parse(localStorage.getItem("iptvUsersBackup") || "{}");
  return Object.keys(primary).length ? primary : backup;
}

function saveUsers(users){
  localStorage.setItem("iptvUsers", JSON.stringify(users));
  localStorage.setItem("iptvUsersBackup", JSON.stringify(users));
}

function updateFormMode(){
  if(isSignUp){
    submitBtn.textContent = "Sign Up";
    toggleMode.textContent = "Already have an account? Sign In";
    emailInput.style.display = "block";
    phoneInput.style.display = "block";
    confirmPasswordInput.style.display = "block";
  } else {
    submitBtn.textContent = "Sign In";
    toggleMode.textContent = "Don't have an account? Sign Up";
    emailInput.style.display = "none";
    phoneInput.style.display = "none";
    confirmPasswordInput.style.display = "none";
  }
}

toggleMode.addEventListener("click",()=>{
  isSignUp = !isSignUp;
  updateFormMode();
});

updateFormMode();

authForm.addEventListener("submit", e=>{
  e.preventDefault();
  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
  const phone = phoneInput.value.trim();
  const password = passwordInput.value.trim();
  const confirmPassword = confirmPasswordInput.value.trim();
  status.textContent = "";

  const users = getUsers();

  if(isSignUp){
    if(!username || !password || !confirmPassword) return status.textContent = "Please fill required fields";
    if(password !== confirmPassword) return status.textContent = "Passwords do not match";
    if(users[username]) return status.textContent = "Username already exists";

    users[username] = {email, phone, password};
    saveUsers(users);
    localStorage.setItem("iptvUsername", username);
    status.textContent = "Sign Up successful! Redirecting...";
    window.location.href = "../index/index.html";
  } else {
    if(!username || !password) return status.textContent = "Please fill required fields";
    if(!users[username] || users[username].password !== password) return status.textContent = "Invalid username or password";

    localStorage.setItem("iptvUsername", username);
    status.textContent = "Sign In successful! Redirecting...";
    window.location.href = "../index/index.html";
  }
});
