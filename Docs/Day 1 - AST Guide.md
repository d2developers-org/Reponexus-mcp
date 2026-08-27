# Day 1: Understanding AST (Abstract Syntax Tree) 🌳

Welcome to Developer 1's Day 1 Guide! Our main goal for this week is to scan TypeScript files and extract functions, classes, and methods. To do this, we need to understand the magic behind how computers read code: **The AST**.

---

## 1. What is an AST? 🤔

Imagine you are reading a sentence: *"The cat sat on the mat."* 
You naturally break it down into grammar:
- Subject: The cat
- Verb: sat
- Object: on the mat

An **Abstract Syntax Tree (AST)** is just how a computer breaks down programming code into its own "grammar tree". Instead of seeing code as just a long string of text, the computer organizes it into a tree of connected blocks (called **nodes**), where each block represents a specific piece of the code.

## 2. Why do Compilers use ASTs? 🛠️

Why can't we just search through the code like a normal text document using `Ctrl+F`?
- **Accuracy**: If you search for the word `function` using normal text search, you might accidentally find the word inside a string (like `console.log("This is a function")`) or a comment!
- **Structure**: An AST understands the *meaning* of the code. It knows that a specific block is a function, what its parameters are, and what code lives inside its body. 

## 3. The Process: Source Code ➡️ Parser ➡️ AST ⚙️

Here is how the magic happens:
1. **Source Code**: You write standard text (e.g., `const x = 5;`).
2. **Parser**: A tool (like TypeScript's compiler) reads the text and figures out the grammar.
3. **AST**: The parser spits out a structured tree of objects that we can easily loop through in our code!

## 4. Understanding Nodes (Parents & Children) 👨‍👩‍👧

An AST is a tree made of **Nodes**. 
- The very top node is usually the **SourceFile** (the file itself).
- Everything inside the file is a **Child** of that file. 
- A class is a child of the file. A method is a child of the class.

## 5. Source Positions 📍

Every node in an AST knows exactly where it lives in the original text file.
It stores the `startLineNumber`, `endLineNumber`, and exact character positions. This is incredibly useful for our project, because we need to extract the exact location of functions!

## 6. Example Analysis 🔍

Let's look at this simple code:
```typescript
function add(a: number, b: number) { 
    return a + b; 
}
```

If we turn this into an AST, the tree looks like this:

- 🌳 `FunctionDeclaration` (name: "add")
  - 🌿 `Parameter` (name: "a", type: "number")
  - 🌿 `Parameter` (name: "b", type: "number")
  - 🌿 `Block` (the code inside the `{ }`)
    - 🍃 `ReturnStatement`
      - 🍂 `BinaryExpression` (a + b)

Notice how beautifully structured it is! If we want to find all the parameters of the function, we just ask the AST for the `FunctionDeclaration`'s children that are `Parameters`.

## 7. AST vs Regex 🥊

You might think, *"Why not just use Regular Expressions (Regex) to find functions?"*

- **Regex**: Great for finding simple text patterns like phone numbers. Terrible for code because code can have weird spacing, comments in the middle of lines, and nested brackets that completely break regex logic.
- **AST**: 100% reliable. It doesn't care about spacing or comments; it only cares about the actual structural grammar of the code.

---

### 🎉 Day 1 Complete!
You are now ready to explain what an AST is! Tomorrow, we will start writing a real script using a library called `ts-morph` to automatically generate these ASTs and extract data from our files.
