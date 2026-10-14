/** Small deny-list of very common passwords (lowercased). Extend freely. */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd", "p@ssword",
  "12345678", "123456789", "1234567890", "123123123", "11111111", "00000000", "87654321", "12341234",
  "qwertyui", "qwerty123", "qwertyuiop", "qwerty12", "qwerty1234", "1q2w3e4r", "1q2w3e4r5t", "1qaz2wsx",
  "abc12345", "abcd1234", "abcdefgh", "abcdefg1", "iloveyou", "iloveyou1", "letmein1", "letmein123",
  "welcome1", "welcome123", "admin123", "administrator", "changeme", "changeme123", "trustno1", "football",
  "baseball", "basketball", "superman", "batman123", "monkey123", "dragon123", "sunshine", "princess",
  "master123", "shadow123", "michael1", "jennifer", "football1", "starwars", "whatever", "freedom1",
  "passpass", "pass1234", "test1234", "testtest", "default1", "guest123", "login123", "hello123",
  "hellohello", "zaq12wsx", "asdfghjk", "asdf1234", "asdfasdf", "zxcvbnm1", "zxcvbnm123", "mypassword",
  "mypassword1", "weighinduel", "weigh-in duel", "weightloss", "loseweight",
]);
